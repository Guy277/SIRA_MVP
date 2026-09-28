// Tests du service des comptes (services/community), avec l'environnement Python
// partagé du moteur (services/engine/.venv, créé par npm run dev:stack).
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const venvPython = join(root, "services", "engine", ".venv", isWindows ? "Scripts" : "bin", isWindows ? "python.exe" : "python");
if (!existsSync(venvPython)) {
  console.error("[comptes] Environnement Python absent : lance d'abord  npm run dev:stack  (il l'installe).");
  process.exit(1);
}
const result = spawnSync(venvPython, ["-m", "unittest", "discover", "-s", "services/community/tests", "-v"], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
