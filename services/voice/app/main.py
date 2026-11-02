"""Service vocal SIRA (port 8200).

Voix → Silero VAD + Whisper → CamemBERTv2 (intent + entités) → correcteur de lieux → décision
→ SIRA-MORE (via l'API NestJS) → phrase de réponse → Piper → voix.
"""
from __future__ import annotations

import base64
import json
import logging
import threading
import time
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import config
from .dialog import FIXED_REPLIES, NOTHING_HEARD, VoiceDialog
from .knowledge import KnowledgeBase
from .llm import LocalLLM
from .resolver import PlaceResolver
from .short_answer import parse_amount, yes_no
from .sira_api import SiraApiClient
from .speech import ParakeetTranscriber, SpeechUnavailable, SpokenCache, Synthesizer, Transcriber, split_sentences, wav_to_mp3
from .trip import TripAnswers

log = logging.getLogger("sira.voice")
STATIC = Path(__file__).resolve().parent / "static"


class Position(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: str | None = Field(default=None, max_length=120)


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    position: Position | None = None
    context: dict[str, Any] | None = None
    trip: dict[str, Any] | None = None  # trajet suivi dans l'application (« je descends où ? »)
    places: list[dict[str, Any]] | None = None  # lieux du voyageur (Maison, Travail…), jamais gardés
    speak: bool = False


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)


def build_state(app: FastAPI, nlu=None, planner=None, live=None):
    """Charge le répertoire de lieux, la FAQ et les modèles. Les tests passent un faux NLU, un faux moteur
    et de faux signalements (live)."""
    state = app.state
    state.errors = {}
    state.resolver = PlaceResolver(config.GAZETTEER_PATH, config.LIEUX_COMPLEMENTS)
    state.knowledge = KnowledgeBase.load(config.KNOWLEDGE_DIR)
    if nlu is None:
        try:
            from .nlu import CamembertNLU
            nlu = CamembertNLU(config.INTENT_MODEL_DIR, config.NER_MODEL_DIR)
        except Exception as error:  # modèles absents ou dépendances manquantes : le service reste joignable
            state.errors["nlu"] = str(error)
            log.error("NLU indisponible : %s", error)
    state.api = SiraApiClient(config.SIRA_API_URL, config.SIRA_API_TIMEOUT_S)
    plan, live = planner or state.api.plan, live or state.api
    trips = TripAnswers(state.resolver, plan, live.impact, live.reports)
    # LLM local seulement s'il est configuré (VOICE_LLM_URL) ; sinon les règles seules, comme avant.
    state.llm = LocalLLM(config.LLM_URL, config.LLM_TIMEOUT_S) if config.LLM_URL else None
    state.dialog = VoiceDialog(nlu, state.resolver, config.PLACE_THRESHOLD, config.PLACE_MARGIN,
                               config.INTENT_MIN_CONFIDENCE, plan, state.knowledge, trips, config.FAQ_THRESHOLD,
                               llm=state.llm) if nlu else None
    state.asr = Transcriber(config.WHISPER_MODEL, config.WHISPER_DEVICE, config.WHISPER_COMPUTE,
                            state.resolver.place_names(kinds=("commune",)), config.MAX_AUDIO_SECONDS, config.WHISPER_BEAM,
                            config.WHISPER_TEMPERATURE, config.WHISPER_TOKENS_PER_S)
    # Parakeet d'abord (≈ 0,5 s), Whisper en secours ; Whisper seul si Parakeet n'est pas installé.
    fast = ParakeetTranscriber(config.PARAKEET_DIR, config.MAX_AUDIO_SECONDS)
    state.fast_asr = fast if config.ASR_MODE == "hybride" and fast.available else None
    state.tts = Synthesizer(config.PIPER_VOICE, config.SPEECH_RATE, config.PIPER_SPEAKER,
                            noise_scale=config.NOISE_SCALE, noise_w=config.NOISE_W)
    state.spoken = SpokenCache(lambda text: encode_audio(state.tts.synthesize(text)))
    if config.PRELOAD:
        # En arrière-plan : le service répond tout de suite, et la première phrase n'attend plus 10 à 20 s.
        threading.Thread(target=warm_speech, args=(state,), daemon=True, name="voice-warmup").start()


def warm_speech(state) -> None:
    for name, part in (("tts", state.tts), ("parakeet", state.fast_asr), ("asr", state.asr)):
        if part is None:
            continue
        try:
            part.warm()
        except Exception as error:  # modèle absent : il sera signalé à la première demande, comme avant
            log.warning("Préchargement %s impossible : %s", name, error)
            continue
        if name == "tts":  # les phrases fixes de SIRA, prêtes avant la première demande (en arrière-plan) :
            # phrase par phrase pour les réponses, entières pour l'application qui en redit certaines d'un bloc
            state.spoken.prepare([*(sentence for reply in FIXED_REPLIES for sentence in split_sentences(reply)), *FIXED_REPLIES])


def hear(state, audio: bytes, unsure: Callable[[str], bool]) -> dict:
    """Parakeet d'abord ; Whisper quand Parakeet n'a rien entendu ou que `unsure(texte)` dit que ce n'est pas sûr.
    Le transcript dit quel moteur a été retenu et le temps de chacun."""
    times = {}
    quick = None
    if state.fast_asr is not None:
        start = time.perf_counter()
        try:
            quick = state.fast_asr.transcribe(audio)
        except SpeechUnavailable as error:
            log.warning("Parakeet indisponible, Whisper prend le relais : %s", error)
        times["parakeet_s"] = round(time.perf_counter() - start, 2)
        if quick and quick["text"] and not unsure(quick["text"]):
            return {**quick, "moteur": "parakeet", **times}
    start = time.perf_counter()
    result = state.asr.transcribe(audio)
    times["whisper_s"] = round(time.perf_counter() - start, 2)
    # Whisper n'a rien rendu, ou s'est mis à boucler : ce que Parakeet a entendu vaut mieux que rien ou qu'une boucle.
    if quick and quick["text"] and (not result.get("text") or result.get("repetitive")):
        log.warning("Whisper écarté (%s) : on garde Parakeet", "boucle" if result.get("repetitive") else "rien entendu")
        return {**quick, "moteur": "parakeet", "whisper_ecarte": True, **times}
    return {**result, "moteur": "whisper", "secours": state.fast_asr is not None, **times}


def encode_audio(wav: bytes) -> tuple[bytes, str]:
    """La voix au format envoyé à l'application (MP3 par défaut) ; le WAV tel quel si l'encodage échoue."""
    if config.AUDIO_FORMAT == "mp3":
        try:
            return wav_to_mp3(wav, config.AUDIO_BITRATE), "audio/mpeg"
        except Exception as error:  # FFmpeg absent ou audio inattendu : la voix part quand même
            log.warning("Encodage MP3 impossible, envoi en WAV : %s", error)
    return wav, "audio/wav"


def ctx_raw_passthrough(context: str | None) -> dict | None:
    """Si rien n'a été entendu, la question en cours reste valable : on rend le contexte tel quel."""
    try:
        return json.loads(context) if context else None
    except json.JSONDecodeError:
        return None


def create_app(nlu=None, planner=None, live=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        build_state(app, nlu, planner, live)
        yield

    app = FastAPI(title="SIRA Voice", version="0.4.0", lifespan=lifespan,
                  description="Assistant vocal SIRA : comprendre les demandes de trajet en français ivoirien.")

    def dialog() -> VoiceDialog:
        if app.state.dialog is None:
            raise HTTPException(503, detail=f"Compréhension indisponible : {app.state.errors.get('nlu')}")
        return app.state.dialog

    def with_audio(payload: dict, speak: bool) -> dict:
        """SIRA parle phrase par phrase : `reply_audio` est la voix de la première phrase de `reply_parts`, envoyée
        sans attendre les autres ; l'application demande les suivantes à /voice/tts pendant qu'elle la joue, et le
        service les prépare déjà (une réponse de trajet : premier son ≈ 0,5 s au lieu de 3,4 s sur le PC de dev)."""
        payload["reply_audio"] = None
        parts = split_sentences(payload.get("reply_text") or "")
        payload["reply_parts"] = parts
        if speak and parts:
            try:
                audio, mime = app.state.spoken.get(parts[0])
                payload["reply_audio"] = {"mime": mime, "base64": base64.b64encode(audio).decode()}
                app.state.spoken.prepare(parts[1:])
            except SpeechUnavailable as error:
                payload["tts_error"] = str(error)
        return payload

    @app.get("/health")
    @app.get("/voice/health")
    def health():
        s = app.state
        return {"status": "ok" if s.dialog else "degraded", "service": "sira-voice", "version": "0.4.0",
                "components": {"nlu": s.dialog is not None, "models_dir": str(config.MODELS_DIR), "places": len(s.resolver), "faq": len(s.knowledge),
                               "asr": {"model": config.WHISPER_NAME, "local": config.WHISPER_MODEL != config.WHISPER_NAME, "loaded": s.asr.loaded,
                                       "mode": "parakeet + whisper en secours" if s.fast_asr else "whisper",
                                       "parakeet_loaded": bool(s.fast_asr and s.fast_asr.loaded)},
                               "tts": {"voice": s.tts.voice_path.name, "available": s.tts.available, "loaded": s.tts.loaded,
                                       "speed": s.tts.speed, "speaker": s.tts.speaker_id, "format": config.AUDIO_FORMAT,
                                       "ready_sentences": len(s.spoken)},
                               "llm": {"url": config.LLM_URL or None, "actif": s.llm is not None},
                               "sira_api": config.SIRA_API_URL},
                "errors": s.errors}

    @app.get("/", include_in_schema=False)
    @app.get("/voice/page", include_in_schema=False)
    def test_page():
        return FileResponse(STATIC / "index.html")

    @app.post("/voice/understand")
    async def understand(request: TextRequest):
        position = request.position.model_dump() if request.position else None
        return (await run_in_threadpool(dialog().understand, request.text, position)).as_dict()

    @app.post("/voice/ask")
    async def ask(request: TextRequest):
        position = request.position.model_dump() if request.position else None
        payload = await run_in_threadpool(dialog().ask, request.text, position, request.context, request.trip, request.places)
        return await run_in_threadpool(with_audio, payload, request.speak)

    @app.post("/voice/query")
    async def query(audio: UploadFile = File(...), lat: float | None = Form(None), lon: float | None = Form(None),
                    context: str | None = Form(None), trip: str | None = Form(None), places: str | None = Form(None),
                    speak: bool = Form(True)):
        data = await audio.read(config.MAX_AUDIO_BYTES + 1)
        if len(data) > config.MAX_AUDIO_BYTES:
            raise HTTPException(413, detail="Audio trop volumineux.")
        if not data:
            raise HTTPException(400, detail="Audio vide.")
        position = {"lat": lat, "lon": lon} if lat is not None and lon is not None else None
        heard_places = ctx_raw_passthrough(places)
        # Parakeet a-t-il bien entendu ? Pas sûr d'un lieu ou de l'intention : Whisper réécoute la même phrase.
        unsure = (lambda text: dialog().needs_better_hearing(text, position, heard_places)) if app.state.dialog else (lambda text: False)
        try:
            transcript = await run_in_threadpool(hear, app.state, data, unsure)
        except SpeechUnavailable as error:
            raise HTTPException(503, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error
        except Exception as error:
            log.exception("Transcription impossible")
            raise HTTPException(400, detail="Audio illisible (formats acceptés : webm, ogg, m4a, mp3, wav).") from error
        # L'audio n'est jamais conservé : il n'existe aucun consentement de collecte à ce stade.
        del data
        if not transcript["text"]:
            payload = {"understanding": None, "context": ctx_raw_passthrough(context), "journey_request": None, "journeys": None,
                       "error": None, "kind": "retry", "chosen_id": None, "sources": [],
                       "reply_text": NOTHING_HEARD}
        else:
            try:
                ctx = json.loads(context) if context else None
            except json.JSONDecodeError:
                ctx = None
            payload = await run_in_threadpool(dialog().ask, transcript["text"], position, ctx, ctx_raw_passthrough(trip),
                                              heard_places)
        payload["transcript"] = transcript
        return await run_in_threadpool(with_audio, payload, speak)

    # Réponse courte pendant le trajet (oui / non, prix payé) : transcription seule, sans NLU ni calcul.
    @app.post("/voice/answer")
    async def answer(audio: UploadFile = File(...)):
        data = await audio.read(config.MAX_AUDIO_BYTES + 1)
        if len(data) > config.MAX_AUDIO_BYTES:
            raise HTTPException(413, detail="Audio trop volumineux.")
        if not data:
            raise HTTPException(400, detail="Audio vide.")
        # « oui », « non », « deux cents francs » : Whisper seulement si Parakeet n'a compris ni oui/non ni un prix.
        unclear = lambda text: yes_no(text) is None and parse_amount(text) is None  # noqa: E731
        try:
            transcript = await run_in_threadpool(hear, app.state, data, unclear)
        except SpeechUnavailable as error:
            raise HTTPException(503, detail=str(error)) from error
        except Exception as error:
            log.exception("Transcription impossible")
            raise HTTPException(400, detail="Audio illisible.") from error
        del data  # jamais conservé
        return {"transcript": transcript, "answer": yes_no(transcript["text"]), "amount": parse_amount(transcript["text"])}

    @app.post("/voice/tts")
    async def tts(request: TtsRequest):
        # Phrase fixe ou suite d'une réponse : souvent déjà prête (SpokenCache).
        try:
            audio, mime = await run_in_threadpool(app.state.spoken.get, request.text)
        except SpeechUnavailable as error:
            raise HTTPException(503, detail=str(error)) from error
        return Response(content=audio, media_type=mime)

    return app


app = create_app()
