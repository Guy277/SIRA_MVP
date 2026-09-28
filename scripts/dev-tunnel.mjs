// npm run dev:tunnel : l'appli en HTTPS sur un téléphone, pour tester le micro et le GPS
// (Safari et Chrome ne les autorisent qu'en HTTPS ou sur localhost).
//
// Prérequis : l'API tourne (npm run dev:stack) et cloudflared est installé
// (winget install Cloudflare.cloudflared). Le script :
//   1. ouvre un tunnel https://…trycloudflare.com vers l'API (4000) ;
//   2. lance une appli Expo dont les appels partent vers ce tunnel
//      (EXPO_PUBLIC_API_URL dans l'environnement du processus, mobile/.env n'est pas modifié) :
//      sur 8081 s'il est libre, sinon sur 8082 (second Expo, accepté par le CORS de développement) ;
//   3. ouvre un second tunnel vers cette appli et affiche l'adresse à ouvrir sur l'iPhone.
// Ctrl+C ferme les tunnels et l'appli.
//
// Procédure manuelle si ce script échoue (voir README « Tester sur téléphone ») :
//   cloudflared tunnel --url http://localhost:4000      -> note l'adresse https (API)
//   cd mobile && set EXPO_PUBLIC_API_URL=<adresse API>/api/v1 && npx expo start --port 8082
//   cloudflared tunnel --url http://localhost:8082      -> ouvre cette adresse sur le téléphone
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npx = isWindows ? "npx.cmd" : "npx";
const children = [];
let stopping = false;

const fail = (message) => {
  console.error(`[SIRA tunnel] ${message}`);
  stop(1);
};

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.killed) continue;
    // Windows : npx lance Expo dans un sous-processus, fermé avec tout son arbre.
    if (isWindows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const portInUse = (port) => new Promise((resolvePort) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolvePort(true); });
  socket.once("error", () => resolvePort(false));
});

// Opens a quick tunnel and resolves with its https address (read from cloudflared's log).
const openTunnel = (name, port) => new Promise((resolveUrl, rejectUrl) => {
  const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const timer = setTimeout(() => rejectUrl(new Error(`le tunnel ${name} n'a pas donné d'adresse en 60 s`)), 60_000);
  const read = (chunk) => {
    const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString())?.[0];
    if (url) { clearTimeout(timer); resolveUrl(url); }
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
  child.on("error", (error) => { clearTimeout(timer); rejectUrl(error); });
  child.on("exit", (code) => {
    if (!stopping) { clearTimeout(timer); rejectUrl(new Error(`le tunnel ${name} s'est fermé (code ${code})`)); }
  });
});

const waitFor = async (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).error) {
  fail("cloudflared est introuvable. Installe-le : winget install Cloudflare.cloudflared (puis rouvre le terminal).");
} else if (!(await portInUse(4000))) {
  fail("L'API SIRA ne répond pas sur le port 4000 : lance d'abord npm run dev:stack dans un autre terminal.");
} else {
  try {
    const appPort = (await portInUse(8081)) ? 8082 : 8081;
    console.log("[SIRA tunnel] Ouverture du tunnel HTTPS de l'API…");
    const apiUrl = await openTunnel("API", 4000);
    console.log(`[SIRA tunnel] API : ${apiUrl}/api/v1`);

    console.log(`[SIRA tunnel] Lancement de l'appli sur le port ${appPort} (appels vers le tunnel de l'API)…`);
    const app = spawn(npx, ["expo", "start", "--port", String(appPort)], {
      cwd: join(root, "mobile"),
      env: { ...process.env, EXPO_PUBLIC_API_URL: `${apiUrl}/api/v1` },
      stdio: "inherit",
      shell: isWindows,
    });
    children.push(app);
    app.on("exit", () => { if (!stopping) stop(0); });
    if (!(await waitFor(appPort, 120_000))) throw new Error(`l'appli ne répond pas sur le port ${appPort}`);

    console.log("[SIRA tunnel] Ouverture du tunnel HTTPS de l'appli…");
    const appUrl = await openTunnel("appli", appPort);
    console.log("");
    console.log(`[SIRA tunnel] Ouvre sur l'iPhone : ${appUrl}`);
    console.log("[SIRA tunnel] Micro et GPS fonctionnent (HTTPS). Le premier chargement peut prendre une minute.");
    console.log("[SIRA tunnel] Ton PC est accessible depuis Internet tant que ce terminal est ouvert (Ctrl+C pour fermer).");
    console.log("[SIRA tunnel] Ne partage pas le lien : en développement le code SMS s'affiche à l'écran.");
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}. Procédure manuelle : README, « Tester sur téléphone ».`);
  }
}

await new Promise(() => {});
