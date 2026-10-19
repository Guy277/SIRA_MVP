// npm run server:update -- <cible> [<cible>…] [--dry-run] : met à jour le serveur de test sans tout renvoyer.
//
// Cibles :
//   api, engine, community, voice   le code du service, puis reconstruction de son conteneur seul
//   models                          services/models/voice, puis redémarrage de la voix
//   data                            data/ (monté dans l'API), puis redémarrage de l'API
//   infra                           infra/ et scripts/server/, puis relance de la stack, de Nginx et de Caddy
//   web                             mobile/dist (appli web exportée), servie telle quelle par Nginx : rien à relancer.
//                                   Exporter d'abord, depuis mobile/ :
//                                   EXPO_PUBLIC_API_URL=https://<SIRA_DOMAIN>/api/v1 npx expo export -p web
//   all                             tout ce qui précède
//
// Seuls les fichiers modifiés (taille ou date différente) sont envoyés, et les fichiers supprimés sur le PC
// le sont aussi sur le serveur, dans le dossier de la cible seulement. --dry-run montre ce qui partirait.
// infra/server.env (secrets du serveur) n'est jamais envoyé ni supprimé.
//
// Serveur : SIRA_SERVER (défaut ubuntu@16.16.129.62) et SIRA_SERVER_KEY (défaut ~/.ssh/sira-test).
// Procédure complète : docs/serveur-test-aws.md
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.SIRA_SERVER || "ubuntu@16.16.129.62";
const key = process.env.SIRA_SERVER_KEY || join(homedir(), ".ssh", "sira-test");
const remoteDir = "sira"; // ~/sira sur le serveur (scripts/server/install.sh)
const compose = "sudo docker compose --env-file infra/server.env -f infra/compose.yaml -f infra/compose.server.yaml";

const TARGETS = {
  api: { paths: ["services/api"], build: ["api"] },
  engine: { paths: ["services/engine"], build: ["engine"] },
  community: { paths: ["services/community"], build: ["community"] },
  voice: { paths: ["services/voice"], build: ["voice"] },
  models: { paths: ["services/models/voice"], restart: ["voice"] },
  data: { paths: ["data"], restart: ["api"] },
  infra: { paths: ["infra", "scripts/server"], stack: true, restart: ["nginx", "caddy"] },
  web: { paths: ["mobile/dist"] },
};

// Ni envoyés ni supprimés : dépendances et caches reconstruits sur place (dont le dist/ des services,
// refait dans leur image), bases et secrets locaux, secrets du serveur.
const EXCLUDED = [
  /(^|\/)(node_modules|\.venv|__pycache__|\.pytest_cache|\.expo)(\/|$)/,
  /^services\/[^/]+\/dist\//,
  /\.db$/,
  /^services\/community\/data\//,
  /^data\/abidjan-master\.zip$/,
  /^infra\/server\.env$/,
];
// L'export web (mobile/dist) part en entier : Expo y range polices et images sous assets/node_modules/.
const excluded = (path) => !path.startsWith("mobile/dist/") && EXCLUDED.some((pattern) => pattern.test(path));

const say = (message) => console.log(`[SIRA serveur] ${message}`);
const fail = (message) => {
  console.error(`[SIRA serveur] ERREUR : ${message}`);
  process.exit(1);
};

const sshArgs = ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "StrictHostKeyChecking=accept-new", host];

// Lance ssh avec une commande distante ; renvoie sa sortie (stdout) et refuse un code de sortie non nul.
function ssh(command, { input = "", capture = true } = {}) {
  return new Promise((done, reject) => {
    const child = spawn("ssh", [...sshArgs, command], { stdio: ["pipe", capture ? "pipe" : "inherit", "inherit"] });
    let out = "";
    if (capture) child.stdout.on("data", (chunk) => (out += chunk));
    child.stdin.end(input);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? done(out) : reject(new Error(`ssh a échoué (code ${code})`))));
  });
}

function localFiles(path) {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split("\\").join("/");
      if (excluded(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const stat = statSync(full);
        files.set(rel, { size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) });
      }
    }
  };
  try {
    walk(join(root, path));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return files;
}

// Fichiers du serveur : « chemin<TAB>taille<TAB>date » (find -printf), plus SIRA_DOMAIN en première ligne
// (toujours présente, même vide). infra/server.env appartient à root (install.sh) : lu avec sudo.
async function remoteState(paths) {
  const list = paths.map((path) => `'${path}'`).join(" ");
  const out = await ssh(
    `cd ~/${remoteDir} && echo "$(sudo sed -n 's/^SIRA_DOMAIN=//p' infra/server.env | tail -1)" && ` +
      `for p in ${list}; do [ -d "$p" ] && find "$p" -type f -printf '%p\\t%s\\t%T@\\n'; done; true`,
  );
  const [domain, ...lines] = out.split("\n");
  if (!domain.trim()) throw new Error(`SIRA_DOMAIN introuvable dans ~/${remoteDir}/infra/server.env : lance d'abord scripts/server/install.sh.`);
  const files = new Map();
  for (const line of lines) {
    const [path, size, mtime] = line.split("\t");
    if (path && !excluded(path)) files.set(path, { size: Number(size), mtime: Math.floor(Number(mtime)) });
  }
  return { domain: domain.trim(), files };
}

// tar du PC (Windows ou Git Bash) -> ssh -> tar du serveur : les dates sont gardées, la prochaine
// comparaison les retrouve identiques.
function upload(files) {
  return new Promise((done, reject) => {
    const tar = spawn("tar", ["-czf", "-", "-T", "-"], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
    const remote = spawn("ssh", [...sshArgs, `mkdir -p ~/${remoteDir} && tar -xzf - -C ~/${remoteDir}`], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    // Branché à la main : sous Windows, donner tar.stdout directement à ssh (stdio) ne transmet rien.
    tar.stdout.pipe(remote.stdin);
    tar.stdin.end(files.join("\n") + "\n");
    let pending = 2;
    const finish = (name) => (code) => {
      if (code !== 0) return reject(new Error(`${name} a échoué (code ${code})`));
      if (--pending === 0) done();
    };
    tar.on("error", reject);
    remote.on("error", reject);
    tar.on("close", finish("tar"));
    remote.on("close", finish("ssh"));
  });
}

const formatSize = (bytes) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} Go` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} Mo` : `${Math.ceil(bytes / 1e3)} Ko`;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  let names = args.filter((arg) => !arg.startsWith("-"));
  if (names.includes("all")) names = Object.keys(TARGETS);
  const unknown = names.filter((name) => !TARGETS[name]);
  if (!names.length || unknown.length || args.includes("--help")) {
    if (unknown.length) console.error(`[SIRA serveur] Cible inconnue : ${unknown.join(", ")}`);
    console.log("Usage : npm run server:update -- <cible> [<cible>…] [--dry-run]");
    console.log(`Cibles : ${Object.keys(TARGETS).join(", ")}, all`);
    process.exit(unknown.length || !names.length ? 1 : 0);
  }

  const targets = names.map((name) => TARGETS[name]);
  const paths = targets.flatMap((target) => target.paths);
  say(`Comparaison avec ${host} (${paths.join(", ")})`);
  const { domain, files: remote } = await remoteState(paths);

  const toSend = [];
  let bytes = 0;
  const local = new Map(paths.flatMap((path) => [...localFiles(path)]));
  for (const [path, file] of local) {
    const there = remote.get(path);
    if (!there || there.size !== file.size || there.mtime !== file.mtime) {
      toSend.push(path);
      bytes += file.size;
    }
  }
  const toDelete = [...remote.keys()].filter((path) => !local.has(path));

  say(`${toSend.length} fichier(s) à envoyer (${formatSize(bytes)}), ${toDelete.length} à supprimer sur le serveur`);
  for (const path of toSend.slice(0, 15)) console.log(`  + ${path}`);
  if (toSend.length > 15) console.log(`  … et ${toSend.length - 15} autre(s)`);
  for (const path of toDelete.slice(0, 15)) console.log(`  - ${path}`);
  if (toDelete.length > 15) console.log(`  … et ${toDelete.length - 15} autre(s)`);

  if (!toSend.length && !toDelete.length) return say("Le serveur est déjà à jour : rien à relancer.");
  if (dryRun) return say("--dry-run : rien n'a été envoyé ni relancé.");

  // install.sh tourne en root : ce qu'il a créé (ex. la page d'attente de mobile/dist) appartient à root
  // et ne pourrait être ni remplacé ni supprimé. On le rend à l'utilisateur SSH, sauf les secrets.
  const list = paths.map((path) => `'${path}'`).join(" ");
  await ssh(
    `cd ~/${remoteDir} && for p in ${list}; do [ -e "$p" ] && sudo find "$p" ! -user "$(id -un)" ` +
      `! -path infra/server.env -exec chown "$(id -u):$(id -g)" {} +; done; true`,
  );

  if (toSend.length) {
    say("Envoi…");
    await upload(toSend);
  }

  // Ce qu'il faut relancer, sans doublon : un conteneur reconstruit n'a pas besoin d'être redémarré.
  const build = [...new Set(targets.flatMap((target) => target.build ?? []))];
  const restart = [...new Set(targets.flatMap((target) => target.restart ?? []))].filter((name) => !build.includes(name));
  const stack = targets.some((target) => target.stack);
  const steps = [`cd ~/${remoteDir}`];
  if (toDelete.length) steps.push(`xargs -r -d '\\n' rm -f --`);
  if (stack) steps.push(`${compose} up -d --remove-orphans`);
  if (build.length) steps.push(`${compose} up -d --build --no-deps ${build.join(" ")}`);
  if (restart.length) steps.push(`${compose} restart ${restart.join(" ")}`);
  const relaunched = [...(stack ? ["stack"] : []), ...build.map((name) => `${name} (reconstruit)`), ...restart];
  say(relaunched.length ? `Relance : ${relaunched.join(", ")}` : "Rien à relancer : Nginx sert les nouveaux fichiers tels quels.");
  await ssh(steps.join(" && "), { input: toDelete.length ? toDelete.join("\n") + "\n" : "", capture: false });

  // Vérification : l'API en HTTPS, et la voix (chargement des modèles : jusqu'à une minute) si elle a bougé.
  const voiceTouched = [...build, ...restart].includes("voice");
  const checks = [
    `for i in $(seq 24); do curl -fsS -m 5 https://${domain}/api/v1/health >/dev/null && echo "API : ok" && break; sleep 5; done`,
  ];
  if (voiceTouched) {
    checks.push(
      `cd ~/${remoteDir} && for i in $(seq 24); do ${compose} exec -T api wget -qO- http://voice:8200/health >/dev/null 2>&1 && echo "Voix : ok" && break; sleep 5; done`,
    );
  }
  // Appli web : la page d'accueil doit être celle de l'export Expo, plus la page d'attente d'install.sh.
  const webTouched = names.includes("web");
  if (webTouched) {
    checks.push(`curl -fsS -m 10 https://${domain}/ | grep -q '_expo/static' && echo "Appli web : ok"`);
  }
  const result = await ssh(checks.join("; "));
  const expected = 1 + (voiceTouched ? 1 : 0) + (webTouched ? 1 : 0);
  if ((result.match(/: ok/g) ?? []).length < expected) {
    fail(`le serveur ne répond pas comme prévu. Journaux : ssh -i ${key} ${host} puis cd ${remoteDir} && ${compose} logs --tail 50`);
  }
  for (const line of result.trim().split("\n")) say(line);
  say(`À jour : https://${domain}`);
}

main().catch((error) => fail(error.message));
