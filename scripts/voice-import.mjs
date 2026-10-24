// npm run voice:import [-- --bench] : range les ZIP de l'enregistreur (services/voice/outils/enregistreur_simple.html)
// dans le projet, puis, avec --bench, mesure Whisper dessus.
//
// Cherche SIRA_test_voix_*.zip (examen), SIRA_entrainement_voix_*.zip et SIRA_piper_voix_*.zip (voix de SIRA) dans
// le dossier de dépôt du projet
// (services/voice/enregistrements/a_ranger/, où l'on peut enregistrer ou glisser les ZIP) et dans Téléchargements
// (ou SIRA_DOWNLOADS), et
// dézippe chacun dans services/voice/enregistrements/test|entrainement|piper/<prénom>_<date>/
// (T01.wav… ou E001.wav… + attendu.csv ; pour Piper wavs/ + metadata.csv, à préparer avec piper_dataset.py). Un ZIP déjà importé est ignoré. --bench ne mesure que l'examen :
// mesurer sur les phrases d'entraînement donnerait des progrès faux.
// Les ZIP restent dans Téléchargements. Le dossier enregistrements/ n'est jamais dans Git : ce sont des voix de
// vraies personnes.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const voiceDir = join(root, "services", "voice");
const target = join(voiceDir, "enregistrements");
const downloads = process.env.SIRA_DOWNLOADS || join(homedir(), "Downloads");
// Dossier de dépôt dans le projet : on peut y enregistrer ou y glisser les ZIP au lieu de Téléchargements.
const dropFolder = join(voiceDir, "enregistrements", "a_ranger");
const isWindows = process.platform === "win32";
const venvPython = join(voiceDir, ".venv", isWindows ? "Scripts/python.exe" : "bin/python");
const python = existsSync(venvPython) ? [venvPython] : isWindows ? ["py", "-3"] : ["python3"];
const say = (message) => console.log(`[voix] ${message}`);

// Dézippe avec Python (présent pour la voix), en refusant les chemins qui sortiraient du dossier.
const UNZIP = `
import sys, zipfile, pathlib
archive, out = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
        if not (out / name).resolve().is_relative_to(out):
            sys.exit(f"chemin refusé dans le ZIP : {name}")
    z.extractall(out)
    print(len(z.namelist()))
`;

if (!existsSync(downloads)) say(`Dossier Téléchargements introuvable (${downloads}) : seul le dossier de dépôt est lu.`);
mkdirSync(target, { recursive: true });

// Empreinte d'un ZIP (nom, taille, date) : écrite dans le dossier importé pour ne pas l'importer deux fois.
const fingerprint = (path) => { const s = statSync(path); return `${basename(path)}|${s.size}|${s.mtimeMs}`; };
// Dossiers importés : enregistrements/<dossier>/ (anciens imports) et enregistrements/test|entrainement/<dossier>/.
const subfolders = (dir) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(dir, d.name)) : [];
const imported = new Set([...subfolders(target), ...subfolders(join(target, "test")), ...subfolders(join(target, "entrainement")), ...subfolders(join(target, "piper"))]
  .map((dir) => join(dir, ".source")).filter(existsSync).map((file) => readFileSync(file, "utf8").trim()));

const ZIP = /^SIRA_(test|entrainement|piper)_voix_(.*)\.zip$/i;
mkdirSync(dropFolder, { recursive: true });
const zipsIn = (dir) => (existsSync(dir) ? readdirSync(dir) : []).filter((name) => ZIP.test(name)).map((name) => ({ name, zipPath: join(dir, name) }));
const zips = [...zipsIn(dropFolder), ...zipsIn(downloads)].sort((a, b) => a.name.localeCompare(b.name));
if (!zips.length) {
  say(`Aucun ZIP SIRA_test_voix_*, SIRA_entrainement_voix_* ou SIRA_piper_voix_* dans ${dropFolder} ni dans ${downloads}.`);
  process.exit(0);
}

const fresh = [];
for (const { name, zipPath } of zips) {
  if (imported.has(fingerprint(zipPath))) { say(`déjà importé : ${name}`); continue; }
  const [, list, rest] = name.match(ZIP);
  const base = join(list.toLowerCase(), rest || "voix");
  mkdirSync(join(target, list.toLowerCase()), { recursive: true });
  let folder = join(target, base);
  for (let n = 2; existsSync(folder); n++) folder = join(target, `${base}_${n}`);
  mkdirSync(folder);
  const result = spawnSync(python[0], [...python.slice(1), "-c", UNZIP, zipPath, folder], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`[voix] ERREUR sur ${name} : ${(result.stderr || result.error?.message || "").trim()}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(join(folder, ".source"), fingerprint(zipPath) + "\n");
  imported.add(fingerprint(zipPath)); // le même ZIP dans les deux dossiers n'est importé qu'une fois
  say(`${name} → services/voice/enregistrements/${list.toLowerCase()}/${basename(folder)} (${result.stdout.trim()} fichiers)`);
  if (list.toLowerCase() === "test") fresh.push(folder);
}

if (process.argv.includes("--bench")) {
  if (!fresh.length) say("Aucun nouvel enregistrement d'examen à mesurer. Pour un dossier déjà importé : npm run voice:bench -- --audio <dossier>");
  for (const folder of fresh) {
    say(`Mesure de Whisper sur ${basename(folder)}…`);
    spawnSync(process.execPath, [join(root, "scripts", "setup-voice.mjs"), "--bench", "--audio", folder], { stdio: "inherit" });
  }
}
