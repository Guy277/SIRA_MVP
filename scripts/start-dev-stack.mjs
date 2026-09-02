import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const smokeTest = process.argv.includes("--smoke-test");
const npm = isWindows ? "npm.cmd" : "npm";
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
const venvRoot = join(root, "services", "ai", ".venv");
const venvPython = isWindows
  ? join(venvRoot, "Scripts", "python.exe")
  : join(venvRoot, "bin", "python");

if (!existsSync(venvPython)) {
  console.log("[SIRA] Création de l'environnement Python du moteur IA…");
  run(pythonCommand, [...pythonPrefix, "-m", "venv", venvRoot]);
}

if (!canRun(venvPython, ["-c", "import fastapi, uvicorn, pydantic"])) {
  console.log("[SIRA] Installation des dépendances du moteur IA…");
  run(venvPython, ["-m", "pip", "install", "-r", join(root, "services", "ai", "requirements.txt")]);
}

if (!existsSync(join(root, "services", "api", "node_modules"))) {
  console.log("[SIRA] Installation des dépendances de l'API…");
  run(npm, ["--prefix", "services/api", "install"]);
}

if (smokeTest) {
  run(npm, ["--prefix", "services/api", "run", "build"]);
}

const start = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: root,
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

const routingUrl = process.env.VALHALLA_URL || (smokeTest ? "http://127.0.0.1:9" : "https://valhalla1.openstreetmap.de");
if (!smokeTest && !process.env.VALHALLA_URL) {
  console.warn("[SIRA] Mode développement : serveur Valhalla public utilisé pour les tests, jamais pour la production.");
}

start("moteur SIRA-MORE", venvPython, [
  "-m", "uvicorn", "services.ai.app.main:app", "--host", "127.0.0.1", "--port", "8000",
]);

const apiEnv = {
  PORT: "4000",
  AI_URL: "http://127.0.0.1:8000",
  VALHALLA_URL: routingUrl,
  OSRM_URL: process.env.OSRM_URL || (smokeTest ? "http://127.0.0.1:9" : "https://router.project-osrm.org"),
  SIRA_DATA_ROOT: join(root, "data"),
  CORS_ORIGIN: "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:8080",
};

if (smokeTest) {
  start("API NestJS", process.execPath, [join(root, "services", "api", "dist", "main.js")], apiEnv);
  start("interface SIRA de test", npm, ["run", "dev"], { PORT: "3010", SIRA_WEB_HOST: "127.0.0.1" });
} else {
  start("API NestJS", npm, ["--prefix", "services/api", "run", "start:dev"], apiEnv);
  start("interface SIRA", npm, ["run", "dev"]);
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

const waitForJson = async (url, timeoutMs = 90_000) => {
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
  ]);
  console.log(`[SIRA] Moteur prêt : ${aiHealth.engine}`);
  console.log(`[SIRA] API prête : ${apiHealth.service}`);

  if (!smokeTest) {
    console.log("[SIRA] Application prête sur http://localhost:3001");
  } else {
    const proxyHealth = await waitForJson("http://127.0.0.1:3010/api/v1/health", 45_000);
    if (proxyHealth?.service !== "sira-api") throw new Error("Le proxy frontend /api n'atteint pas NestJS.");
    console.log("[SIRA] Proxy frontend prêt : /api atteint bien NestJS.");
    const journeyRequest = {
      origin: { lat: 5.294081, lon: -3.9553985, name: "Départ test réseau" },
      destination: { lat: 5.3534368, lon: -4.0151186, name: "Arrivée test réseau" },
      budget: 1500,
      preference: "balanced",
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
    };
    const response = await fetch("http://127.0.0.1:3010/api/v1/mobility/journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify(journeyRequest),
    });
    if (!response.ok) throw new Error(`Le calcul bout en bout a échoué (${response.status}).`);
    const result = await response.json();
    if (result?.engine?.name !== "SIRA-MORE" || result?.source !== "sira-more-v1.1-phase-1" || !result?.journeys?.length) {
      throw new Error("La réponse ne prouve pas le passage par SIRA-MORE.");
    }
    console.log(`[SIRA] Test bout en bout réussi : ${result.journeys.length} trajet(s), recommandation ${result.recommended_id}.`);

    const aiProcess = children.find((child) => child.siraName === "moteur SIRA-MORE");
    if (!aiProcess) throw new Error("Le processus SIRA-MORE du test est introuvable.");
    aiProcess.siraExpectedExit = true;
    aiProcess.kill("SIGTERM");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
    const unavailableResponse = await fetch("http://127.0.0.1:3010/api/v1/mobility/journeys", {
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
