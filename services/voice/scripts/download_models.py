"""Télécharge UNE FOIS tous les modèles prêts à l'emploi dans services/voice/models/, pour un fonctionnement hors ligne.

- Whisper (faster-whisper, CTranslate2)  -> models/whisper/<small|turbo>/   (small ≈ 480 Mo, turbo ≈ 1,6 Go)
- Voix Piper fr_FR-siwis-medium (CC BY 4.0) -> models/piper/               (≈ 63 Mo)
- Silero VAD est inclus dans le paquet faster-whisper (≈ 1 Mo) : rien à télécharger.
- Les modèles CamemBERT entraînés sur Colab sont copiés à la main (voir README) ; ce script vérifie leur présence.

Usage : python services/voice/scripts/download_models.py [--whisper small|turbo]
"""
import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
WHISPER_REPOS = {"small": "Systran/faster-whisper-small", "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
                 "large-v3": "Systran/faster-whisper-large-v3"}
VOICE = "fr_FR-siwis-medium"


def download_whisper(name: str) -> None:
    from huggingface_hub import snapshot_download

    target = MODELS / "whisper" / name
    if (target / "model.bin").exists():
        print(f"[voix] Whisper {name} déjà présent : {target}")
        return
    print(f"[voix] Téléchargement de Whisper {name} (une seule fois)…")
    snapshot_download(WHISPER_REPOS[name], local_dir=target,
                      allow_patterns=["config.json", "preprocessor_config.json", "model.bin", "tokenizer.json", "vocabulary.*"])
    print(f"[voix] Whisper {name} prêt : {target}")


def download_piper() -> None:
    from huggingface_hub import hf_hub_download

    target = MODELS / "piper" / f"{VOICE}.onnx"
    if target.exists():
        print(f"[voix] Voix Piper déjà présente : {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    for suffix in (".onnx", ".onnx.json"):
        src = hf_hub_download("rhasspy/piper-voices", f"fr/fr_FR/siwis/medium/{VOICE}{suffix}")
        shutil.copy(src, target.parent / f"{VOICE}{suffix}")
    print(f"[voix] Voix Piper prête : {target}")


def check_trained_models() -> bool:
    for base in (MODELS / "sira_models_v0.4", ROOT.parent.parent / "data" / "sira_models_v0.4"):
        needed = [base / "sira-intent-fr-ci" / "model.safetensors", base / "sira-ner-fr-ci" / "model.safetensors",
                  base / "gazetteer_v0.4.json"]
        if all(p.exists() for p in needed):
            print(f"[voix] Modèles CamemBERT entraînés trouvés : {base}")
            return True
    print("[voix] ⚠️  Modèles entraînés introuvables. Copie le dossier sira_models_v0.4 (sortie du notebook Colab)")
    print("       dans  data\\  ou dans  services\\voice\\models\\  (ou définis VOICE_MODELS_DIR dans .env).")
    return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--whisper", default="small", choices=sorted(WHISPER_REPOS))
    args = parser.parse_args()
    ok = True
    for step, fn in (("Whisper", lambda: download_whisper(args.whisper)), ("Piper", download_piper)):
        try:
            fn()
        except Exception as error:
            ok = False
            print(f"[voix] {step} non téléchargé ({error}). Il sera téléchargé au premier usage (ou relance ce script).")
    sys.exit(0 if check_trained_models() and ok else 2)
