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
# Réserve de modèles des services (hors Git) : services/models/voice/ en local, /models/voice dans le conteneur.
# Tout y est téléchargé ou copié une fois (Whisper, Piper, CamemBERT) : aucun appel Internet ensuite.
LOCAL_MODELS = _path("VOICE_MODELS_ROOT", SERVICE_ROOT.parent / "models" / "voice")

# Dossier produit par le notebook Colab (sira_models_v0.4) : sira-intent-fr-ci/, sira-ner-fr-ci/, gazetteer_v0.4.json
# Cherché dans cet ordre : VOICE_MODELS_DIR, services/models/voice/, puis data/ à la racine du projet.
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
# Recherche large (5) : ≈ 20 % plus lente que 1 sur CPU, mais garde « je quitte Yopougon » et « je descends où »
# que la recherche simple déformait (mesuré sur 8 phrases). Le gain de vitesse vient du prompt court (speech.py).
WHISPER_BEAM = max(1, int(_float("VOICE_WHISPER_BEAM", 5)))
WHISPER_DEVICE = os.environ.get("VOICE_WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("VOICE_WHISPER_COMPUTE", "int8")

# Synthèse vocale : voix Piper françaises (fichier .onnx + .onnx.json), au choix du voyageur.
# Femme : siwis (CC BY 4.0). Homme : « pierre » du jeu upmc (locuteur 1, CC BY-SA 4.0), comme le personnage de SIRA.
PIPER_VOICE = _path("VOICE_PIPER_MODEL", LOCAL_MODELS / "piper" / "fr_FR-siwis-medium.onnx")
PIPER_MALE_VOICE = _path("VOICE_PIPER_MALE_MODEL", LOCAL_MODELS / "piper" / "fr_FR-upmc-medium.onnx")
# Locuteur dans un modèle à plusieurs voix (upmc : 0 = jessica, 1 = pierre) ; vide pour un modèle à une voix.
_MALE_SPEAKER = os.environ.get("VOICE_PIPER_MALE_SPEAKER", "1").strip()
PIPER_MALE_SPEAKER = int(_MALE_SPEAKER) if _MALE_SPEAKER else None
# Voix quand l'application n'en demande pas : « homme » ou « femme ».
DEFAULT_VOICE = os.environ.get("VOICE_DEFAULT", "homme")
if DEFAULT_VOICE not in ("homme", "femme"):
    DEFAULT_VOICE = "homme"
# Vitesse de lecture : 1.0 = voix d'origine, 1.1 = 10 % plus rapide (plus naturel pour des consignes courtes).
SPEECH_RATE = min(1.5, max(0.7, _float("VOICE_SPEECH_RATE", 1.1)))
# Intonation de Piper : plus bas = voix plus régulière. 0,5 / 0,6 choisis à l'écoute le 2026-10-25 (réglage « D »,
# préféré à l'actuel 0,667 / 0,8, à « plus posé » et à « plus vivant ») ; les valeurs d'origine du modèle sont 0,667 / 0,8.
NOISE_SCALE = min(1.0, max(0.0, _float("VOICE_NOISE_SCALE", 0.5)))
NOISE_W = min(1.0, max(0.0, _float("VOICE_NOISE_W", 0.6)))
# Voix envoyée à l'application : MP3 (≈ 9 fois plus léger que le WAV : 47 Ko au lieu de 411 Ko pour 9 s de parole,
# mesuré le 2026-10-25), lu partout (web, Android, iPhone). « wav » pour l'audio brut.
AUDIO_FORMAT = os.environ.get("VOICE_AUDIO_FORMAT", "mp3")
if AUDIO_FORMAT not in ("mp3", "wav"):
    AUDIO_FORMAT = "mp3"
AUDIO_BITRATE = int(_float("VOICE_AUDIO_BITRATE", 40_000))
# Charger Whisper et Piper dès le démarrage (sinon la première phrase attend 10 à 20 s). 0 = au premier usage.
PRELOAD = os.environ.get("VOICE_PRELOAD", "1") != "0"

# API NestJS de SIRA (calcul des trajets via SIRA-MORE)
SIRA_API_URL = os.environ.get("SIRA_API_URL", "http://127.0.0.1:4000/api/v1").rstrip("/")
SIRA_API_TIMEOUT_S = _float("SIRA_API_TIMEOUT_S", 60.0)

# Règles de décision. Le seuil de 60 avait été mesuré sur des lieux du répertoire seulement : un lieu qui n'y est
# pas trouvait toujours un voisin au-dessus (« Bouaké » → Bouquet 86, « banane » → Anan 89, « Dakar » → MACA 67)
# et le trajet partait sans question. Les vrais lieux mal dits restent presque tous au-dessus de 100 ; entre les
# deux, SIRA demande « Tu veux dire … ? ».
PLACE_THRESHOLD = _float("VOICE_PLACE_THRESHOLD", 90.0)
PLACE_MARGIN = _float("VOICE_PLACE_MARGIN", 3.0)
INTENT_MIN_CONFIDENCE = _float("VOICE_INTENT_MIN_CONFIDENCE", 0.5)

# FAQ : fiches Markdown ; une fiche répond au-dessus de ce score (0 à 1, réglé sur services/voice/tests).
KNOWLEDGE_DIR = _path("VOICE_KNOWLEDGE_DIR", SERVICE_ROOT / "knowledge")
FAQ_THRESHOLD = _float("VOICE_FAQ_THRESHOLD", 0.65)

# Compléments du répertoire de lieux (dans Git) : lieux ajoutés, coordonnées manquantes, variantes d'orthographe et
# commune exacte de chaque lieu (scripts/corriger_lieux.py). Appliqués au chargement par PlaceResolver.
LIEUX_COMPLEMENTS = _path("VOICE_LIEUX_COMPLEMENTS", KNOWLEDGE_DIR / "lieux_complements.json")

MAX_AUDIO_BYTES = int(_float("VOICE_MAX_AUDIO_BYTES", 5 * 1024 * 1024))
MAX_AUDIO_SECONDS = _float("VOICE_MAX_AUDIO_SECONDS", 30.0)
