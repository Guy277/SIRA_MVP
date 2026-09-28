// Lance toute la stack SIRA en développement : SIRA-MORE (8000), comptes (8100), voix (8200, si installée),
// API (4000) et l'appli Expo (8081 : navigateur et Expo Go). --smoke-test : test de bout en bout, puis arrêt.
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const smokeTest = process.argv.includes("--smoke-test");
const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";
const children = [];
let stopping = false;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: isWindows && command.endsWith(".cmd"), ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`La commande ${command} ${args.join(" ")} a échoué.`);
  }
};

const canRun = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore" });
  return !result.error && result.status === 0;
};

const pythonCandidates = isWindows
  ? [["python", []], ["py", ["-3"]]]
  : [["python3", []], ["python", []]];
const python = pythonCandidates.find(([command, prefix]) => canRun(command, [...prefix, "--version"]));
if (!python) {
  throw new Error("Python 3 est requis pour démarrer le moteur SIRA-MORE.");
}

const [pythonCommand, pythonPrefix] = python;
// Environnement Python partagé par SIRA-MORE (services/engine) et le service des comptes.
const venvRoot = join(root, "services", "engine", ".venv");
const venvPython = isWindows
  ? join(venvRoot, "Scripts", "python.exe")
  : join(venvRoot, "bin", "python");

if (!existsSync(venvPython)) {
  console.log("[SIRA] Création de l'environnement Python de SIRA-MORE…");
  run(pythonCommand, [...pythonPrefix, "-m", "venv", venvRoot]);
}

if (!canRun(venvPython, ["-c", "import fastapi, uvicorn, pydantic"])) {
  console.log("[SIRA] Installation des dépendances de SIRA-MORE…");
  run(venvPython, ["-m", "pip", "install", "-r", join(root, "services", "engine", "requirements.txt")]);
}

// Accounts and community fares (built from the AKA branch) share the venv.
if (!canRun(venvPython, ["-c", "import sqlalchemy, jwt, httpx"])) {
  console.log("[SIRA] Installation des dépendances du service communautaire…");
  run(venvPython, ["-m", "pip", "install", "-r", join(root, "services", "community", "requirements.txt")]);
}

if (!existsSync(join(root, "services", "api", "node_modules"))) {
  console.log("[SIRA] Installation des dépendances de l'API…");
  run(npm, ["--prefix", "services/api", "install"]);
}

if (smokeTest) {
  run(npm, ["--prefix", "services/api", "run", "build"]);
}

const start = (name, command, args, env = {}, cwd = root) => {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: isWindows && command.endsWith(".cmd"),
  });
  child.siraName = name;
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping && !child.siraExpectedExit && code !== 0) {
      console.error(`[SIRA] ${name} s'est arrêté avec le code ${code}.`);
      stop(code ?? 1);
    }
  });
  return child;
};

// La marche (accès, correspondances, sortie) est calculée par Valhalla : sans lui, aucun trajet n'est proposé
// (pas de marche « à vol d'oiseau »). Le test de bout en bout utilise donc le même serveur que le développement.
const routingUrl = process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de";
if (!process.env.VALHALLA_URL) {
  console.warn("[SIRA] Mode développement : serveur Valhalla public utilisé pour les tests, jamais pour la production.");
}

start("moteur SIRA-MORE", venvPython, [
  "-m", "uvicorn", "services.engine.app.main:app", "--host", "127.0.0.1", "--port", "8000",
]);

start("service communautaire", venvPython, [
  "-m", "uvicorn", "services.community.app.main:app", "--host", "127.0.0.1", "--port", "8100",
], { SIRA_ENV: "development" });

// Assistant vocal : optionnel (≈ 2 Go de dépendances), démarré seulement après `npm run voice:setup`.
const voiceVenvPython = isWindows
  ? join(root, "services", "voice", ".venv", "Scripts", "python.exe")
  : join(root, "services", "voice", ".venv", "bin", "python");
const voiceEnabled = !smokeTest && process.env.SIRA_VOICE !== "false" && existsSync(voiceVenvPython);
if (voiceEnabled) {
  const voiceChild = start("assistant vocal", voiceVenvPython, [
    "-m", "uvicorn", "services.voice.app.main:app", "--host", "127.0.0.1", "--port", "8200",
  ], { SIRA_API_URL: "http://127.0.0.1:4000/api/v1" });
  voiceChild.siraExpectedExit = true; // un souci de modèles vocaux ne doit pas arrêter toute la stack
} else if (!smokeTest) {
  console.log("[SIRA] Assistant vocal non installé (optionnel) : npm run voice:setup pour l'activer.");
}

const apiEnv = {
  PORT: "4000",
  AI_URL: "http://127.0.0.1:8000",
  COMMUNITY_URL: "http://127.0.0.1:8100",
  VOICE_URL: "http://127.0.0.1:8200",
  VALHALLA_URL: routingUrl,
  OSRM_URL: process.env.OSRM_URL || "https://router.project-osrm.org",
  SIRA_DATA_ROOT: join(root, "data"),
  SIRA_GRAPH_WORKER: "true",
  // 8081 : appli Expo dans le navigateur ; 8080 : appli web exportée servie par Nginx (infra/compose.yaml).
  // Expo Go (téléphone) n'est pas concerné par CORS.
  CORS_ORIGIN: "http://localhost:8081,http://localhost:8080",
};

const portInUse = (port) => new Promise((resolvePort) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => { socket.destroy(); resolvePort(true); });
  socket.once("error", () => resolvePort(false));
});

if (smokeTest) {
  start("API NestJS", process.execPath, [join(root, "services", "api", "dist", "main.js")], apiEnv);
} else {
  start("API NestJS", npm, ["--prefix", "services/api", "run", "start:dev"], apiEnv);
}

// Appli mobile (Expo, 8081) : navigateur et Expo Go (QR code). SIRA_MOBILE=false pour la lancer à part.
let mobileNote = "";
if (!smokeTest && process.env.SIRA_MOBILE !== "false") {
  const mobileDir = join(root, "mobile");
  if (!existsSync(join(mobileDir, "node_modules"))) {
    mobileNote = "Appli non lancée : installe-la d'abord avec  cd mobile && npm install";
  } else if (await portInUse(8081)) {
    mobileNote = "Appli déjà lancée sur http://localhost:8081 (Expo Go : son QR code est dans l'autre terminal)";
  } else {
    const mobile = start("appli Expo", npx, ["expo", "start", "--port", "8081"], {}, mobileDir);
    mobile.siraExpectedExit = true; // fermer Expo ne doit pas arrêter les services
    mobileNote = "Appli : http://localhost:8081 — sur téléphone, scanne le QR code avec Expo Go (même Wi-Fi)";
  }
}

const stop = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
};

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

// Démarrage à froid : l'API construit le graphe des lignes pendant que la voix charge ses modèles (≈ 1 Go),
// ce qui peut dépasser 90 s sur un PC portable. Au-delà de 4 min, c'est un vrai blocage.
const waitForJson = async (url, timeoutMs = 240_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response.json();
    } catch {
      // Le service est encore en cours de démarrage.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Le service ${url} n'est pas devenu disponible.`);
};

try {
  const [aiHealth, apiHealth] = await Promise.all([
    waitForJson("http://127.0.0.1:8000/health"),
    waitForJson("http://127.0.0.1:4000/api/v1/health"),
    waitForJson("http://127.0.0.1:8100/health"),
  ]);
  console.log(`[SIRA] Moteur prêt : ${aiHealth.engine}`);
  console.log("[SIRA] Comptes et tarifs communautaires prêts");
  console.log(`[SIRA] API prête : ${apiHealth.service}`);

  if (!smokeTest) {
    if (voiceEnabled) {
      waitForJson("http://127.0.0.1:8200/health", 180_000)
        .then((voice) => console.log(`[SIRA] Assistant vocal prêt (${voice.status}) : page de test http://localhost:8200`))
        .catch(() => console.warn("[SIRA] L'assistant vocal ne répond pas : voir services/voice/README.md"));
    }
    if (mobileNote) console.log(`[SIRA] ${mobileNote}`);
  } else {
    if (apiHealth?.service !== "sira-api") throw new Error("L'API ne répond pas comme l'API SIRA.");
    const journeyRequest = {
      origin: { lat: 5.294081, lon: -3.9553985, name: "Départ test réseau" },
      destination: { lat: 5.3534368, lon: -4.0151186, name: "Arrivée test réseau" },
      // Pas de budget : le test prouve le passage par SIRA-MORE, pas le filtrage par prix (couvert par test:ai).
      preference: "balanced",
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
    };
    const response = await fetch("http://127.0.0.1:4000/api/v1/mobility/journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(journeyRequest),
    });
    if (!response.ok) throw new Error(`Le calcul bout en bout a échoué (${response.status}).`);
    const result = await response.json();
    if (result?.engine?.name !== "SIRA-MORE" || result?.source !== "sira-more-v2.0" || !result?.journeys?.length) {
      throw new Error("La réponse ne prouve pas le passage par SIRA-MORE.");
    }
    console.log(`[SIRA] Test bout en bout réussi : ${result.journeys.length} trajet(s), recommandation ${result.recommended_id}.`);

    const aiProcess = children.find((child) => child.siraName === "moteur SIRA-MORE");
    if (!aiProcess) throw new Error("Le processus SIRA-MORE du test est introuvable.");
    aiProcess.siraExpectedExit = true;
    aiProcess.kill("SIGTERM");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
    const unavailableResponse = await fetch("http://127.0.0.1:4000/api/v1/mobility/journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(journeyRequest),
    });
    const unavailablePayload = await unavailableResponse.json();
    if (unavailableResponse.status !== 503 || !String(unavailablePayload?.message ?? "").includes("SIRA-MORE")) {
      throw new Error("L'API doit refuser explicitement le calcul lorsque SIRA-MORE est arrêté.");
    }
    console.log("[SIRA] Test d'indisponibilité réussi : aucun faux classement SIRA-MORE n'est affiché.");
    stop(0);
  }
} catch (error) {
  console.error(`[SIRA] ${error instanceof Error ? error.message : String(error)}`);
  stop(1);
}

await new Promise(() => {});
