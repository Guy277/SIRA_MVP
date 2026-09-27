"""Configuration du service vocal SIRA (variables d'environnement, valeurs par défaut pour le développement)."""
import os
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent


def _path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


REPO_ROOT = SERVICE_ROOT.parent.parent
LOCAL_MODELS = SERVICE_ROOT / "models"  # modèles téléchargés une fois (Whisper, Piper) : aucun appel Internet ensuite

# Dossier produit par le notebook Colab (sira_models_v0.4) : sira-intent-fr-ci/, sira-ner-fr-ci/, gazetteer_v0.4.json
# Cherché dans cet ordre : VOICE_MODELS_DIR, services/voice/models/, puis data/ à la racine du projet.
_TRAINED_CANDIDATES = [LOCAL_MODELS / "sira_models_v0.4", REPO_ROOT / "data" / "sira_models_v0.4"]
MODELS_DIR = _path("VOICE_MODELS_DIR", next((d for d in _TRAINED_CANDIDATES if d.exists()), _TRAINED_CANDIDATES[0]))
INTENT_MODEL_DIR = MODELS_DIR / "sira-intent-fr-ci"
NER_MODEL_DIR = MODELS_DIR / "sira-ner-fr-ci"
GAZETTEER_PATH = _path("VOICE_GAZETTEER", MODELS_DIR / "gazetteer_v0.4.json")

# Transcription : faster-whisper (Silero VAD intégré). "small" ou "turbo" en int8 tournent sur CPU.
WHISPER_NAME = os.environ.get("VOICE_WHISPER_MODEL", "small")
_WHISPER_LOCAL = LOCAL_MODELS / "whisper" / WHISPER_NAME
# Copie locale (npm run voice:setup) si elle existe, sinon faster-whisper télécharge le modèle au premier usage.
WHISPER_MODEL = str(_WHISPER_LOCAL) if (_WHISPER_LOCAL / "model.bin").exists() else WHISPER_NAME
WHISPER_DEVICE = os.environ.get("VOICE_WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("VOICE_WHISPER_COMPUTE", "int8")

# Synthèse vocale : voix Piper française (fichier .onnx + .onnx.json)
PIPER_VOICE = _path("VOICE_PIPER_MODEL", LOCAL_MODELS / "piper" / "fr_FR-siwis-medium.onnx")

# API NestJS de SIRA (calcul des trajets via SIRA-MORE)
SIRA_API_URL = os.environ.get("SIRA_API_URL", "http://127.0.0.1:4000/api/v1").rstrip("/")
SIRA_API_TIMEOUT_S = _float("SIRA_API_TIMEOUT_S", 60.0)

# Règles de décision (mesurées sur la validation v0.4 : ~99 % de lieux justes quand SIRA ne demande pas)
PLACE_THRESHOLD = _float("VOICE_PLACE_THRESHOLD", 60.0)
PLACE_MARGIN = _float("VOICE_PLACE_MARGIN", 3.0)
INTENT_MIN_CONFIDENCE = _float("VOICE_INTENT_MIN_CONFIDENCE", 0.5)

# FAQ : fiches Markdown ; une fiche répond au-dessus de ce score (0 à 1, réglé sur services/voice/tests).
KNOWLEDGE_DIR = _path("VOICE_KNOWLEDGE_DIR", SERVICE_ROOT / "knowledge")
FAQ_THRESHOLD = _float("VOICE_FAQ_THRESHOLD", 0.65)

MAX_AUDIO_BYTES = int(_float("VOICE_MAX_AUDIO_BYTES", 5 * 1024 * 1024))
MAX_AUDIO_SECONDS = _float("VOICE_MAX_AUDIO_SECONDS", 30.0)
