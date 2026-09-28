"""Service vocal SIRA (port 8200).

Voix → Silero VAD + Whisper → CamemBERTv2 (intent + entités) → correcteur de lieux → décision
→ SIRA-MORE (via l'API NestJS) → phrase de réponse → Piper → voix.
"""
from __future__ import annotations

import base64
import json
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import config
from .dialog import VoiceDialog
from .knowledge import KnowledgeBase
from .resolver import PlaceResolver
from .short_answer import parse_amount, yes_no
from .sira_api import SiraApiClient
from .speech import SpeechUnavailable, Synthesizer, Transcriber
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
    speak: bool = False


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)


def build_state(app: FastAPI, nlu=None, planner=None, live=None):
    """Charge le répertoire de lieux, la FAQ et les modèles. Les tests passent un faux NLU, un faux moteur
    et de faux signalements (live)."""
    state = app.state
    state.errors = {}
    state.resolver = PlaceResolver(config.GAZETTEER_PATH)
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
    state.dialog = VoiceDialog(nlu, state.resolver, config.PLACE_THRESHOLD, config.PLACE_MARGIN,
                               config.INTENT_MIN_CONFIDENCE, plan, state.knowledge, trips, config.FAQ_THRESHOLD) if nlu else None
    state.asr = Transcriber(config.WHISPER_MODEL, config.WHISPER_DEVICE, config.WHISPER_COMPUTE,
                            state.resolver.place_names(kinds=("commune",)), config.MAX_AUDIO_SECONDS, config.WHISPER_BEAM)
    state.tts = Synthesizer(config.PIPER_VOICE, config.SPEECH_RATE)
    if config.PRELOAD:
        # En arrière-plan : le service répond tout de suite, et la première phrase n'attend plus 10 à 20 s.
        threading.Thread(target=warm_speech, args=(state,), daemon=True, name="voice-warmup").start()


def warm_speech(state) -> None:
    for name, part in (("tts", state.tts), ("asr", state.asr)):
        try:
            part.warm()
        except Exception as error:  # modèle absent : il sera signalé à la première demande, comme avant
            log.warning("Préchargement %s impossible : %s", name, error)


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
        payload["reply_audio"] = None
        if speak and payload.get("reply_text"):
            try:
                wav = app.state.tts.synthesize(payload["reply_text"])
                payload["reply_audio"] = {"mime": "audio/wav", "base64": base64.b64encode(wav).decode()}
            except SpeechUnavailable as error:
                payload["tts_error"] = str(error)
        return payload

    @app.get("/health")
    @app.get("/voice/health")
    def health():
        s = app.state
        return {"status": "ok" if s.dialog else "degraded", "service": "sira-voice", "version": "0.4.0",
                "components": {"nlu": s.dialog is not None, "models_dir": str(config.MODELS_DIR), "places": len(s.resolver), "faq": len(s.knowledge),
                               "asr": {"model": config.WHISPER_NAME, "local": config.WHISPER_MODEL != config.WHISPER_NAME, "loaded": s.asr.loaded},
                               "tts": {"voice": s.tts.voice_path.name, "available": s.tts.available, "loaded": s.tts.loaded,
                                       "speed": s.tts.speed},
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
        payload = await run_in_threadpool(dialog().ask, request.text, position, request.context, request.trip)
        return await run_in_threadpool(with_audio, payload, request.speak)

    @app.post("/voice/query")
    async def query(audio: UploadFile = File(...), lat: float | None = Form(None), lon: float | None = Form(None),
                    context: str | None = Form(None), trip: str | None = Form(None), speak: bool = Form(True)):
        data = await audio.read(config.MAX_AUDIO_BYTES + 1)
        if len(data) > config.MAX_AUDIO_BYTES:
            raise HTTPException(413, detail="Audio trop volumineux.")
        if not data:
            raise HTTPException(400, detail="Audio vide.")
        try:
            transcript = await run_in_threadpool(app.state.asr.transcribe, data)
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
                       "reply_text": "Pardon, je n'ai rien entendu. Pouvez-vous répéter un peu plus fort, s'il vous plaît ?"}
        else:
            position = {"lat": lat, "lon": lon} if lat is not None and lon is not None else None
            try:
                ctx = json.loads(context) if context else None
            except json.JSONDecodeError:
                ctx = None
            payload = await run_in_threadpool(dialog().ask, transcript["text"], position, ctx, ctx_raw_passthrough(trip))
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
        try:
            transcript = await run_in_threadpool(app.state.asr.transcribe, data)
        except SpeechUnavailable as error:
            raise HTTPException(503, detail=str(error)) from error
        except Exception as error:
            log.exception("Transcription impossible")
            raise HTTPException(400, detail="Audio illisible.") from error
        del data  # jamais conservé
        return {"transcript": transcript, "answer": yes_no(transcript["text"]), "amount": parse_amount(transcript["text"])}

    @app.post("/voice/tts")
    async def tts(request: TtsRequest):
        try:
            wav = await run_in_threadpool(app.state.tts.synthesize, request.text)
        except SpeechUnavailable as error:
            raise HTTPException(503, detail=str(error)) from error
        return Response(content=wav, media_type="audio/wav")

    return app


app = create_app()
