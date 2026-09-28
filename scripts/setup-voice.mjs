// Assistant vocal SIRA : installation, lancement seul et tests.
//   npm run voice:setup   crée services/voice/.venv, installe les dépendances, télécharge Whisper et Piper
//                         dans services/models/voice/ (réserve de modèles, hors Git)
//   npm run dev:voice     lance uniquement le service vocal (port 8200)
//   npm run test:voice    lance les tests du service vocal (sans les gros modèles)
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const voiceDir = join(root, "services", "voice");
const isWindows = process.platform === "win32";
const venvPython = isWindows ? join(voiceDir, ".venv", "Scripts", "python.exe") : join(voiceDir, ".venv", "bin", "python");

const run = (command, args, { allowFailure = false } = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`La commande ${command} ${args.join(" ")} a échoué.`);
  }
  return result.status ?? 1;
};
const canRun = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore" });
  return !result.error && result.status === 0;
};

if (process.argv.includes("--test")) {
  const python = existsSync(venvPython) ? [venvPython, []] : (isWindows ? ["py", ["-3"]] : ["python3", []]);
  process.exit(run(python[0], [...python[1], "-m", "unittest", "discover", "-s", "services/voice/tests", "-v"], { allowFailure: true }));
}

if (process.argv.includes("--run")) {
  if (!existsSync(venvPython)) {
    console.error("[voix] Service non installé : lance d'abord  npm run voice:setup");
    process.exit(1);
  }
  const child = spawn(venvPython, ["-m", "uvicorn", "services.voice.app.main:app", "--host", "127.0.0.1", "--port", "8200"], {
    cwd: root, stdio: "inherit", env: { SIRA_API_URL: "http://127.0.0.1:4000/api/v1", ...process.env },
  });
  console.log("[voix] Page de test : http://localhost:8200  (l'API SIRA doit tourner pour calculer les trajets)");
  process.on("SIGINT", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  const candidates = isWindows ? [["python", []], ["py", ["-3"]]] : [["python3", []], ["python", []]];
  const python = candidates.find(([command, prefix]) => canRun(command, [...prefix, "--version"]));
  if (!python) throw new Error("Python 3 est requis pour l'assistant vocal.");

  if (!existsSync(venvPython)) {
    console.log("[voix] Création de l'environnement Python services/voice/.venv …");
    run(python[0], [...python[1], "-m", "venv", join(voiceDir, ".venv")]);
  }
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  if (!canRun(venvPython, ["-c", "import torch"])) {
    console.log("[voix] Installation de PyTorch (version CPU, ≈ 200 Mo) …");
    run(venvPython, ["-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cpu"]);
  }
  console.log("[voix] Installation des dépendances (FastAPI, transformers, faster-whisper…) …");
  run(venvPython, ["-m", "pip", "install", "-r", join(voiceDir, "requirements.txt")]);
  console.log("[voix] Installation de la synthèse vocale Piper (optionnelle) …");
  if (run(venvPython, ["-m", "pip", "install", "-r", join(voiceDir, "requirements-tts.txt")], { allowFailure: true }) !== 0) {
    console.warn("[voix] Piper non installé : la réponse sera lue par la voix du navigateur ou du téléphone.");
  }
  console.log("[voix] Téléchargement des modèles (une seule fois, ensuite tout fonctionne hors ligne) …");
  const models = run(venvPython, [join(voiceDir, "scripts", "download_models.py"), "--whisper", process.env.VOICE_WHISPER_MODEL || "small"], { allowFailure: true });
  console.log(models === 0
    ? "\n[voix] ✅ Assistant vocal prêt. Lance  npm run dev:stack  (ou  npm run dev:voice  seul) puis ouvre http://localhost:8200"
    : "\n[voix] ⚠️  Installation faite, mais copie les modèles entraînés dans services/models/voice/ avant de lancer (voir services/models/README.md).");
}
