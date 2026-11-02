"""Transcription « Parakeet d'abord, Whisper en secours » contre Whisper seul, sur de vrais enregistrements.

Mêmes classes que le service vocal (ParakeetTranscriber, Transcriber, VoiceDialog.needs_better_hearing), mêmes calculs
que benchmark_voice.py (taux d'erreur de mots, lieu trouvé par CamemBERT + répertoire de lieux).
Le temps du circuit hybride comprend Parakeet, la vérification (CamemBERT) et, si besoin, Whisper.

Usage, depuis la racine du projet (pile SIRA arrêtée pour des temps justes) :
  services/voice/.venv/Scripts/python services/voice/scripts/bench_hybride.py DOSSIER [DOSSIER...]
Rapport : services/voice/benchmarks/<date>_hybride/rapport.md (+ resultats.csv).
"""
from __future__ import annotations

import csv
import io
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import benchmark_voice as bv  # noqa: E402
from services.voice.app import config  # noqa: E402
from services.voice.app.dialog import VoiceDialog  # noqa: E402
from services.voice.app.main import hear  # noqa: E402
from services.voice.app.nlu import CamembertNLU  # noqa: E402
from services.voice.app.resolver import PlaceResolver  # noqa: E402
from services.voice.app.speech import ParakeetTranscriber, Transcriber  # noqa: E402


def main() -> None:
    folders = [Path(arg) for arg in sys.argv[1:]]
    if not folders:
        sys.exit(__doc__)
    resolver = PlaceResolver(config.GAZETTEER_PATH, config.LIEUX_COMPLEMENTS)
    nlu = CamembertNLU(config.INTENT_MODEL_DIR, config.NER_MODEL_DIR)
    dialog = VoiceDialog(nlu, resolver, config.PLACE_THRESHOLD, config.PLACE_MARGIN, config.INTENT_MIN_CONFIDENCE)
    understanding = (nlu, resolver)
    state = type("State", (), {})()
    state.fast_asr = ParakeetTranscriber(config.PARAKEET_DIR, config.MAX_AUDIO_SECONDS)
    state.asr = Transcriber(config.WHISPER_MODEL, config.WHISPER_DEVICE, config.WHISPER_COMPUTE,
                            resolver.place_names(kinds=("commune",)), config.MAX_AUDIO_SECONDS, config.WHISPER_BEAM,
                            config.WHISPER_TEMPERATURE, config.WHISPER_TOKENS_PER_S)
    whisper_only = type("State", (), {"fast_asr": None, "asr": state.asr})()
    nlu.predict("Je veux aller au Plateau")
    state.fast_asr.warm()
    state.asr.transcribe(next(folders[0].glob("*.wav")).read_bytes())  # chauffe de Whisper

    rows = []
    for folder in folders:
        for sample in bv.recorded_samples(folder):
            audio = Path(sample["fichier"]).read_bytes()
            for circuit, current in (("whisper seul", whisper_only), ("parakeet + secours", state)):
                start = time.perf_counter()
                transcript = hear(current, audio, lambda text: dialog.needs_better_hearing(text))
                seconds = time.perf_counter() - start
                found = bv.understand(understanding, transcript["text"])["lieu_trouve"]
                wer = bv.word_error_rate(sample["texte"], transcript["text"]) if sample["texte"] else None
                rows.append({"voix": folder.name, "fichier": Path(sample["fichier"]).name, "circuit": circuit,
                             "moteur": transcript["moteur"], "secondes": round(seconds, 2),
                             "boucle": bool(transcript.get("repetitive") or transcript.get("whisper_ecarte")),
                             "wer": round(wer, 3) if wer is not None else None, "lieu_attendu": sample["lieu"] or "",
                             "lieu_trouve": found or "", "lieu_juste": bv.same_place(sample["lieu"], found),
                             "texte": transcript["text"]})
                print(f"  {folder.name[:12]:12} {rows[-1]['fichier']:8} {circuit:18} {transcript['moteur']:8} "
                      f"{seconds:5.2f} s  « {transcript['text'][:50]} »", flush=True)

    lines = ["# Parakeet d'abord, Whisper en secours", "",
             f"- **Machine :** {bv.machine_info()['processeur']} · {datetime.now():%Y-%m-%d %H:%M}",
             f"- **Whisper :** {config.WHISPER_NAME}, beam {config.WHISPER_BEAM}, int8, température {config.WHISPER_TEMPERATURE:g}, "
             f"au plus {config.WHISPER_TOKENS_PER_S:g} jetons/s (+ 16) · **Parakeet :** TDT 0.6B v3 int8",
             "", "| Voix | Circuit | Temps moyen | Pire | Repasse par Whisper | Whisper boucle | WER | Bon lieu |",
             "|---|---|---|---|---|---|---|---|"]
    for voice in dict.fromkeys(r["voix"] for r in rows):
        for circuit in ("whisper seul", "parakeet + secours"):
            items = [r for r in rows if r["voix"] == voice and r["circuit"] == circuit]
            wers = [r["wer"] for r in items if r["wer"] is not None]
            places = [r["lieu_juste"] for r in items if r["lieu_juste"] is not None]
            fallback = sum(r["moteur"] == "whisper" for r in items) if circuit != "whisper seul" else len(items)
            lines.append(f"| {voice} | {circuit} | {statistics.mean(r['secondes'] for r in items):.2f} s | "
                         f"{max(r['secondes'] for r in items):.2f} s | {fallback}/{len(items)} | {sum(r['boucle'] for r in items)} | "
                         f"{100 * statistics.mean(wers):.1f} % | {sum(places)}/{len(places)} |")
    out = ROOT / "services" / "voice" / "benchmarks" / f"{datetime.now():%Y-%m-%d_%H%M}_hybride"
    out.mkdir(parents=True, exist_ok=True)
    (out / "rapport.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    with open(out / "resultats.csv", "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]), delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    print("\n".join(lines))
    print(f"\nRapport : {out}")


if __name__ == "__main__":
    main()
