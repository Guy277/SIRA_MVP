"""Mesure la vitesse (et la justesse) de l'assistant vocal SIRA sur cette machine.

Pour chaque modèle Whisper et chaque réglage de beam demandé, le script mesure :
  - le temps de transcription de chaque phrase (mêmes réglages que le service : français, VAD, prompt des communes) ;
  - le taux d'erreur de mots (WER) quand le texte attendu est connu ;
  - si CamemBERT est installé : le temps de compréhension et si le bon lieu de destination est trouvé ;
  - le temps de Piper pour lire des réponses types.
Il écrit un rapport lisible (rapport.md), le détail (resultats.csv) et la fiche de la machine (machine.json)
dans services/voice/benchmarks/<date>_<machine>/, pour comparer ce PC avec un PC à carte NVIDIA ou un serveur.

Lancement depuis la racine du projet SIRA :
  npm run voice:bench
  npm run voice:bench -- --beams 5,2,1
  npm run voice:bench -- --audio C:\\chemin\\vers\\mes_enregistrements --models small,turbo
  npm run voice:bench -- --models small,french-distil --device cuda      (sur un PC à carte NVIDIA)

Phrases de test :
  - Sans --audio : 12 phrases SIRA lues par la voix Piper. Ça mesure bien la VITESSE, pas la justesse sur l'accent
    ivoirien (la voix est française et synthétique).
  - Avec --audio DOSSIER : tes vrais enregistrements (wav, mp3, m4a, ogg, webm, flac). Le texte attendu, facultatif,
    se met dans DOSSIER/attendu.csv avec les colonnes  fichier;texte;lieu  (séparateur ; ou ,), ou dans un .txt
    du même nom que l'audio.

Modèles (--models, séparés par des virgules) : small, turbo, large-v3, french-distil
(bofenghuang/whisper-large-v3-french-distil-dec4, ≈ 1,6 Go), ou le chemin d'un dossier faster-whisper.
Un modèle absent de services/models/voice/whisper/ est téléchargé une fois (Internet nécessaire).
"""
from __future__ import annotations

import argparse
import csv
import ctypes
import datetime as dt
import json
import os
import platform
import re
import shutil
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

VOICE_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = VOICE_ROOT.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from services.voice.app import config  # noqa: E402

AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".opus", ".aac"}
WHISPER_DIR = config.LOCAL_MODELS / "whisper"
REMOTE_MODELS = {
    "small": ("Systran/faster-whisper-small", None),
    "turbo": ("mobiuslabsgmbh/faster-whisper-large-v3-turbo", None),
    "large-v3": ("Systran/faster-whisper-large-v3", None),
    "french-distil": ("bofenghuang/whisper-large-v3-french-distil-dec4", "ctranslate2"),
}
WHISPER_FILES = ["config.json", "preprocessor_config.json", "model.bin", "tokenizer.json", "vocabulary.*"]

# Phrases de démonstration : demandes réelles d'usagers de SIRA, avec le lieu attendu (None = pas de trajet).
SAMPLE_PHRASES = [
    ("Je veux aller à Cocody.", "Cocody"),
    ("Comment je fais pour partir à Yopougon ?", "Yopougon"),
    ("Je quitte Abobo, je vais au Plateau.", "Plateau"),
    ("Le gbaka pour Adjamé, c'est combien ?", "Adjamé"),
    ("Je descends à Treichville.", "Treichville"),
    ("On peut aller à Marcory en wôrô-wôrô ?", "Marcory"),
    ("Je veux prendre le bateau-bus pour le Plateau.", "Plateau"),
    ("Montre-moi le chemin pour Koumassi.", "Koumassi"),
    ("Je pars à Port-Bouët, mais je ne veux pas trop marcher.", "Port-Bouët"),
    ("C'est quel bus SOTRA pour Bingerville ?", "Bingerville"),
    ("Je vais à Anyama avec cinq cents francs.", "Anyama"),
    ("Y a des bouchons sur mon trajet ?", None),
]
# Réponses types de SIRA, pour mesurer la synthèse vocale.
SAMPLE_REPLIES = [
    "D'accord, je cherche ton trajet pour Cocody.",
    "Prends le gbaka à Adjamé Liberté, descends à Abobo Gare. Ça fait trois cents francs, environ vingt-cinq minutes.",
    "Il y a un embouteillage signalé sur ton trajet. Je te propose de passer par le bateau-bus.",
]


# ----------------------------------------------------------------------------- machine
def _ram_gb() -> float | None:
    try:
        if sys.platform == "win32":
            class MemoryStatus(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong),
                            ("avail", ctypes.c_ulonglong), ("total_page", ctypes.c_ulonglong),
                            ("avail_page", ctypes.c_ulonglong), ("total_virtual", ctypes.c_ulonglong),
                            ("avail_virtual", ctypes.c_ulonglong), ("avail_ext", ctypes.c_ulonglong)]
            status = MemoryStatus()
            status.length = ctypes.sizeof(MemoryStatus)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
            return round(status.total / 1024 ** 3, 1)
        if sys.platform == "darwin":
            return round(int(subprocess.check_output(["sysctl", "-n", "hw.memsize"])) / 1024 ** 3, 1)
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal"):
                return round(int(line.split()[1]) / 1024 ** 2, 1)
    except Exception:
        pass
    return None


def _cpu_name() -> str:
    try:
        if sys.platform == "win32":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        if sys.platform == "darwin":
            return subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return platform.processor() or "inconnu"


def _gpus() -> list[str]:
    if not shutil.which("nvidia-smi"):
        return []
    try:
        out = subprocess.check_output(["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
                                       "--format=csv,noheader"], text=True, timeout=10)
        return [line.strip() for line in out.splitlines() if line.strip()]
    except Exception:
        return []


def _version(module: str) -> str | None:
    try:
        from importlib.metadata import version
        return version(module)
    except Exception:
        return None


def machine_info() -> dict:
    cuda_devices = 0
    try:
        import ctranslate2
        cuda_devices = ctranslate2.get_cuda_device_count()
    except Exception:
        pass
    return {
        "nom": socket.gethostname(),
        "systeme": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "processeur": _cpu_name(),
        "coeurs_logiques": os.cpu_count(),
        "memoire_go": _ram_gb(),
        "gpu_nvidia": _gpus(),
        "gpu_cuda_utilisables": cuda_devices,
        "python": platform.python_version(),
        "faster_whisper": _version("faster-whisper"),
        "ctranslate2": _version("ctranslate2"),
        "torch": _version("torch"),
        "piper_tts": _version("piper-tts"),
        "date": dt.datetime.now().isoformat(timespec="seconds"),
    }


# ----------------------------------------------------------------------------- texte
def normalize_text(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text.lower()).replace("’", "'")
    text = re.sub(r"[^\w'\- ]+", " ", text)
    return [word for word in re.split(r"[\s\-']+", text) if word]


def word_error_rate(reference: str, hypothesis: str) -> float | None:
    ref, hyp = normalize_text(reference), normalize_text(hypothesis)
    if not ref:
        return None
    previous = list(range(len(hyp) + 1))
    for i, ref_word in enumerate(ref, 1):
        current = [i] + [0] * len(hyp)
        for j, hyp_word in enumerate(hyp, 1):
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ref_word != hyp_word))
        previous = current
    return previous[-1] / len(ref)


def same_place(expected: str | None, found: str | None) -> bool | None:
    if not expected:
        return None
    if not found:
        return False
    strip = lambda value: "".join(c for c in unicodedata.normalize("NFD", value.lower()) if c.isalnum())
    return strip(expected) == strip(found)


# ----------------------------------------------------------------------------- phrases de test
def load_expected(folder: Path) -> dict[str, dict]:
    expected: dict[str, dict] = {}
    table = folder / "attendu.csv"
    if table.exists():
        content = table.read_text(encoding="utf-8-sig")
        dialect = csv.Sniffer().sniff(content.splitlines()[0], delimiters=";,") if content.strip() else csv.excel
        for row in csv.DictReader(content.splitlines(), dialect=dialect):
            name = (row.get("fichier") or "").strip()
            if name:
                expected[Path(name).stem] = {"texte": (row.get("texte") or "").strip(), "lieu": (row.get("lieu") or "").strip() or None}
    for sidecar in folder.glob("*.txt"):
        expected.setdefault(sidecar.stem, {"texte": sidecar.read_text(encoding="utf-8").strip(), "lieu": None})
    return expected


def recorded_samples(folder: Path) -> list[dict]:
    expected = load_expected(folder)
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in AUDIO_EXTENSIONS)
    if not files:
        raise SystemExit(f"Aucun fichier audio dans {folder} (formats acceptés : {', '.join(sorted(AUDIO_EXTENSIONS))}).")
    return [{"fichier": p, "texte": expected.get(p.stem, {}).get("texte"), "lieu": expected.get(p.stem, {}).get("lieu")}
            for p in files]


def synthetic_samples(tts, workdir: Path) -> list[dict]:
    samples = []
    for index, (text, place) in enumerate(SAMPLE_PHRASES, 1):
        path = workdir / f"phrase_{index:02d}.wav"
        path.write_bytes(tts.synthesize(text))
        samples.append({"fichier": path, "texte": text, "lieu": place})
    return samples


# ----------------------------------------------------------------------------- modèles
def resolve_whisper(name: str) -> tuple[str, str]:
    """Renvoie (chemin local du modèle, origine)."""
    as_path = Path(name).expanduser()
    if as_path.is_dir():
        return str(as_path), "dossier fourni"
    local = WHISPER_DIR / name
    if (local / "model.bin").exists():
        return str(local), "local"
    if name not in REMOTE_MODELS:
        raise SystemExit(f"Modèle Whisper inconnu : {name} (choix : {', '.join(REMOTE_MODELS)} ou un dossier).")
    repo, subfolder = REMOTE_MODELS[name]
    from huggingface_hub import snapshot_download

    print(f"  Téléchargement de {name} ({repo}), une seule fois…", flush=True)
    patterns = [f"{subfolder}/{pattern}" for pattern in WHISPER_FILES] if subfolder else WHISPER_FILES
    snapshot_download(repo, local_dir=local, allow_patterns=patterns)
    model_dir = local / subfolder if subfolder else local
    if subfolder:  # rangé comme les autres : services/models/voice/whisper/<nom>/model.bin
        for item in model_dir.iterdir():
            shutil.move(str(item), local / item.name)
        model_dir.rmdir()
    return str(local), "téléchargé"


def whisper_prompt() -> str:
    try:
        from services.voice.app.resolver import PlaceResolver
        names = PlaceResolver(config.GAZETTEER_PATH).place_names(kinds=("commune",))
    except Exception:
        names = []
    return f"Trajet à Abidjan en gbaka, wôrô-wôrô, bus SOTRA ou bateau-bus : {', '.join(names[:15])}."


def load_understanding():
    """CamemBERT + répertoire de lieux, comme le service. None si absents."""
    try:
        from services.voice.app.nlu import CamembertNLU
        from services.voice.app.resolver import PlaceResolver
        started = time.perf_counter()
        nlu = CamembertNLU(config.INTENT_MODEL_DIR, config.NER_MODEL_DIR)
        resolver = PlaceResolver(config.GAZETTEER_PATH)
        nlu.predict("Je veux aller au Plateau")  # première prédiction, toujours plus lente
        return nlu, resolver, time.perf_counter() - started
    except Exception as error:
        print(f"  Compréhension (CamemBERT) non mesurée : {error}")
        return None


def understand(understanding, text: str) -> dict:
    nlu, resolver = understanding[0], understanding[1]
    started = time.perf_counter()
    intent, confidence, entities = nlu.predict(text)
    seconds = time.perf_counter() - started
    target = next((e for e in entities if e["label"] == "DESTINATION"), None) \
        or next((e for e in entities if e["label"] == "PLACE"), None)
    place = None
    if target:
        matches = resolver.resolve(target["text"])
        place = matches[0].canonical if matches else None
    return {"nlu_s": seconds, "intention": intent, "confiance": round(confidence, 3), "lieu_trouve": place}


# ----------------------------------------------------------------------------- mesures
def benchmark_whisper(name: str, beams: list[int], device: str, compute: str, samples: list[dict], prompt: str,
                      understanding, repeat: int) -> tuple[list[dict], dict]:
    from faster_whisper import WhisperModel, decode_audio

    path, origin = resolve_whisper(name)
    started = time.perf_counter()
    model = WhisperModel(path, device=device, compute_type=compute)
    load_s = time.perf_counter() - started
    import numpy as np
    list(model.transcribe(np.zeros(16000, dtype=np.float32), language="fr", beam_size=1)[0])  # chauffe

    audio = [(sample, decode_audio(str(sample["fichier"]), sampling_rate=16000)) for sample in samples]
    rows = []
    for beam in beams:
        for sample, samples_16k in audio:
            duration = len(samples_16k) / 16000
            timings, text = [], ""
            for _ in range(repeat):
                started = time.perf_counter()
                segments, _info = model.transcribe(
                    samples_16k, language="fr", beam_size=beam, vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 500}, initial_prompt=prompt,
                    condition_on_previous_text=False,
                )
                text = " ".join(segment.text.strip() for segment in segments).strip()
                timings.append(time.perf_counter() - started)
            seconds = statistics.median(timings)
            row = {
                "modele": name, "beam": beam, "appareil": f"{device}/{compute}", "fichier": Path(sample["fichier"]).name,
                "duree_audio_s": round(duration, 2), "transcription_s": round(seconds, 3),
                "vitesse_x_temps_reel": round(duration / seconds, 2) if seconds else None,
                "texte_attendu": sample["texte"] or "", "texte_entendu": text,
                "wer": None, "lieu_attendu": sample["lieu"] or "", "lieu_trouve": "", "lieu_juste": None,
                "intention": "", "comprehension_s": None,
            }
            if sample["texte"]:
                wer = word_error_rate(sample["texte"], text)
                row["wer"] = round(wer, 3) if wer is not None else None
            if understanding:
                result = understand(understanding, text)
                row.update({"comprehension_s": round(result["nlu_s"], 3), "intention": result["intention"],
                            "lieu_trouve": result["lieu_trouve"] or "",
                            "lieu_juste": same_place(sample["lieu"], result["lieu_trouve"])})
            rows.append(row)
            print(f"  {name:>13} beam {beam} · {row['fichier']:<22} {seconds:6.2f} s  « {text[:60]} »", flush=True)
    del model
    return rows, {"modele": name, "origine": origin, "chargement_s": round(load_s, 1)}


def benchmark_tts(tts) -> list[dict]:
    import io
    import wave

    rows = []
    for text in SAMPLE_REPLIES:
        started = time.perf_counter()
        wav = tts.synthesize(text)
        seconds = time.perf_counter() - started
        with wave.open(io.BytesIO(wav)) as audio:
            duration = audio.getnframes() / audio.getframerate()
        rows.append({"texte": text, "synthese_s": round(seconds, 3), "duree_voix_s": round(duration, 2)})
    return rows


# ----------------------------------------------------------------------------- rapport
def mean(values) -> float | None:
    values = [v for v in values if v is not None]
    return statistics.mean(values) if values else None


def fmt(value, digits=2, suffix="") -> str:
    return "—" if value is None else f"{value:.{digits}f}{suffix}"


def summarize(rows: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        groups.setdefault((row["modele"], row["beam"], row["appareil"]), []).append(row)
    summary = []
    for (model, beam, device), items in groups.items():
        times = [r["transcription_s"] for r in items]
        places = [r["lieu_juste"] for r in items if r["lieu_juste"] is not None]
        summary.append({
            "modele": model, "beam": beam, "appareil": device, "phrases": len(items),
            "transcription_moy_s": mean(times), "transcription_max_s": max(times),
            "vitesse_x_temps_reel": mean([r["vitesse_x_temps_reel"] for r in items]),
            "wer_moy": mean([r["wer"] for r in items]),
            "lieux_justes": f"{sum(places)}/{len(places)}" if places else None,
            "comprehension_moy_s": mean([r["comprehension_s"] for r in items]),
        })
    return summary


def write_report(folder: Path, machine: dict, summary: list[dict], loads: list[dict], tts_rows: list[dict],
                 understanding_load: float | None, synthetic: bool, rows: list[dict]) -> Path:
    gpu = ", ".join(machine["gpu_nvidia"]) or "aucun GPU NVIDIA détecté"
    lines = [
        "# Mesure de l'assistant vocal SIRA", "",
        f"- **Machine :** {machine['nom']} · {machine['systeme']}",
        f"- **Processeur :** {machine['processeur']} ({machine['coeurs_logiques']} cœurs logiques)",
        f"- **Mémoire :** {fmt(machine['memoire_go'], 1, ' Go')}",
        f"- **Carte graphique :** {gpu}",
        f"- **Date :** {machine['date']}",
        f"- **Phrases :** {len({r['fichier'] for r in rows})} "
        + ("(voix Piper synthétique : mesure la vitesse, pas la justesse sur l'accent ivoirien)" if synthetic
           else "(enregistrements fournis)"),
        "", "## Transcription (Whisper)", "",
        "| Modèle | Beam | Appareil | Temps moyen / phrase | Pire phrase | Vitesse (× temps réel) | Erreur de mots (WER) | Bon lieu trouvé |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for item in summary:
        lines.append(f"| {item['modele']} | {item['beam']} | {item['appareil']} | {fmt(item['transcription_moy_s'], 2, ' s')} "
                     f"| {fmt(item['transcription_max_s'], 2, ' s')} | {fmt(item['vitesse_x_temps_reel'], 1, ' ×')} "
                     f"| {fmt(None if item['wer_moy'] is None else item['wer_moy'] * 100, 1, ' %')} | {item['lieux_justes'] or '—'} |")
    lines += ["", "Vitesse × temps réel : au-dessus de 1, la phrase est transcrite plus vite qu'elle n'a été dite.", "",
              "| Modèle | Origine | Chargement |", "|---|---|---|"]
    lines += [f"| {item['modele']} | {item['origine']} | {fmt(item['chargement_s'], 1, ' s')} |" for item in loads]
    lines += ["", "## Compréhension (CamemBERT + répertoire de lieux)", ""]
    understanding_times = [s["comprehension_moy_s"] for s in summary if s["comprehension_moy_s"] is not None]
    if understanding_times:
        lines.append(f"- Chargement : {fmt(understanding_load, 1, ' s')} · temps moyen par phrase : "
                     f"{fmt(mean(understanding_times) * 1000, 0, ' ms')}")
    else:
        lines.append("- Non mesurée (modèles CamemBERT absents ou dépendances manquantes).")
    lines += ["", "## Voix de SIRA (Piper)", ""]
    if tts_rows:
        lines += ["| Réponse | Temps de synthèse | Durée de la voix |", "|---|---|---|"]
        lines += [f"| {r['texte'][:60]}… | {fmt(r['synthese_s'], 2, ' s')} | {fmt(r['duree_voix_s'], 1, ' s')} |" for r in tts_rows]
    else:
        lines.append("- Non mesurée (voix Piper absente).")
    best = min(summary, key=lambda item: item["transcription_moy_s"] or 1e9) if summary else None
    if best:
        understanding_s = best["comprehension_moy_s"] or 0
        tts_s = mean([r["synthese_s"] for r in tts_rows]) or 0
        lines += ["", "## Attente estimée d'un usager (hors calcul du trajet)", "",
                  f"Réglage le plus rapide : **{best['modele']}, beam {best['beam']}** → transcription "
                  f"{fmt(best['transcription_moy_s'], 2, ' s')} + compréhension {fmt(understanding_s, 2, ' s')} "
                  f"+ voix {fmt(tts_s, 2, ' s')} ≈ **{fmt(best['transcription_moy_s'] + understanding_s + tts_s, 1, ' s')}**."]
    lines += ["", "Détail phrase par phrase : `resultats.csv`. Fiche de la machine : `machine.json`.", ""]
    report = folder / "rapport.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    return report


# ----------------------------------------------------------------------------- programme
def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Mesure la vitesse de l'assistant vocal SIRA sur cette machine.")
    parser.add_argument("--audio", type=Path, help="dossier d'enregistrements (sinon : phrases lues par Piper)")
    parser.add_argument("--models", default=config.WHISPER_NAME, help="modèles Whisper, séparés par des virgules (défaut : celui du service)")
    parser.add_argument("--beams", default=str(config.WHISPER_BEAM), help="valeurs de beam, ex. 5,2,1 (défaut : celle du service)")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="auto = carte NVIDIA si disponible")
    parser.add_argument("--compute", default=None, help="int8 (processeur), float16 ou int8_float16 (carte NVIDIA)")
    parser.add_argument("--repeat", type=int, default=1, help="répétitions par phrase (la médiane est gardée)")
    parser.add_argument("--out", type=Path, default=VOICE_ROOT / "benchmarks", help="dossier des résultats")
    args = parser.parse_args()

    machine = machine_info()
    device = args.device
    if device == "auto":
        device = "cuda" if machine["gpu_cuda_utilisables"] else "cpu"
    compute = args.compute or ("float16" if device == "cuda" else config.WHISPER_COMPUTE)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    beams = [int(b) for b in args.beams.split(",") if b.strip()]

    print(f"Machine : {machine['processeur']} · {fmt(machine['memoire_go'], 1, ' Go')} · "
          f"{', '.join(machine['gpu_nvidia']) or 'pas de GPU NVIDIA'} → calcul sur {device}/{compute}")

    from services.voice.app.speech import Synthesizer
    tts = Synthesizer(config.PIPER_VOICE, config.SPEECH_RATE)
    tts_ready = True
    try:
        tts.warm()
    except Exception as error:
        tts_ready = False
        print(f"  Voix Piper indisponible : {error}")

    workdir = Path(tempfile.mkdtemp(prefix="sira_bench_"))
    try:
        if args.audio:
            samples, synthetic = recorded_samples(args.audio), False
        elif tts_ready:
            print(f"Création de {len(SAMPLE_PHRASES)} phrases de test avec Piper…")
            samples, synthetic = synthetic_samples(tts, workdir), True
        else:
            raise SystemExit("Pas d'enregistrements (--audio) et pas de voix Piper pour en créer : rien à mesurer.")

        print("Chargement de la compréhension (CamemBERT)…")
        understanding = load_understanding()
        prompt = whisper_prompt()

        rows, loads = [], []
        for name in models:
            print(f"Whisper {name} :")
            model_rows, load = benchmark_whisper(name, beams, device, compute, samples, prompt, understanding, max(1, args.repeat))
            rows += model_rows
            loads.append(load)

        print("Voix de SIRA (Piper)…")
        tts_rows = benchmark_tts(tts) if tts_ready else []
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    stamp = dt.datetime.now().strftime("%Y-%m-%d_%H%M")
    folder = args.out / f"{stamp}_{re.sub(r'[^A-Za-z0-9_-]+', '-', machine['nom'])}"
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / "resultats.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), delimiter=";")
        writer.writeheader()
        # Virgule décimale : le fichier s'ouvre directement dans Excel en français.
        writer.writerows({key: str(value).replace(".", ",") if isinstance(value, float) else value
                          for key, value in row.items()} for row in rows)
    (folder / "machine.json").write_text(json.dumps(machine, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = summarize(rows)
    report = write_report(folder, machine, summary, loads, tts_rows,
                          understanding[2] if understanding else None, synthetic, rows)
    print("\n" + report.read_text(encoding="utf-8"))
    print(f"Résultats enregistrés dans : {folder}")


if __name__ == "__main__":
    main()
