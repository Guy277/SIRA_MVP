"""Transcription (faster-whisper + Silero VAD intégré) et synthèse vocale (Piper). Chargés au premier usage."""
from __future__ import annotations

import io
import threading
import wave
from pathlib import Path


class SpeechUnavailable(RuntimeError):
    pass


class Transcriber:
    def __init__(self, model: str, device: str, compute_type: str, prompt_names: list[str], max_seconds: float):
        self.model_name, self.device, self.compute_type = model, device, compute_type
        self.max_seconds = max_seconds
        # Le prompt aide Whisper à écrire correctement les noms d'Abidjan et les modes locaux.
        names = ", ".join(prompt_names[:40])
        self.prompt = f"Trajet à Abidjan en gbaka, wôrô-wôrô, bus SOTRA ou bateau-bus. Lieux : {names}."
        self._model = None
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as error:
                    raise SpeechUnavailable("faster-whisper n'est pas installé (npm run voice:setup)") from error
                self._model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type)
        return self._model

    def transcribe(self, audio: bytes) -> dict:
        model = self._load()  # lève SpeechUnavailable si faster-whisper manque
        from faster_whisper import decode_audio

        samples = decode_audio(io.BytesIO(audio), sampling_rate=16000)  # webm, ogg, m4a, wav… via PyAV
        duration = len(samples) / 16000
        if duration > self.max_seconds:
            raise ValueError(f"Audio trop long ({duration:.0f} s, maximum {self.max_seconds:.0f} s)")
        segments, info = model.transcribe(
            samples, language="fr", beam_size=5, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500}, initial_prompt=self.prompt,
            condition_on_previous_text=False,
        )
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments).strip()
        avg_logprob = sum(s.avg_logprob for s in segments) / len(segments) if segments else None
        return {"text": text, "duration_s": round(duration, 2), "speech_detected": bool(segments),
                "avg_logprob": round(avg_logprob, 3) if avg_logprob is not None else None}


class Synthesizer:
    def __init__(self, voice_path: Path):
        self.voice_path = Path(voice_path)
        self._voice = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.voice_path.exists()

    def _load(self):
        with self._lock:
            if self._voice is None:
                if not self.voice_path.exists():
                    raise SpeechUnavailable(f"Voix Piper introuvable : {self.voice_path} (npm run voice:setup)")
                try:
                    from piper import PiperVoice
                except ImportError as error:
                    raise SpeechUnavailable("piper-tts n'est pas installé (npm run voice:setup)") from error
                self._voice = PiperVoice.load(str(self.voice_path))
        return self._voice

    def synthesize(self, text: str) -> bytes:
        voice = self._load()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            if hasattr(voice, "synthesize_wav"):  # piper-tts ≥ 1.3
                voice.synthesize_wav(text, wav)
            else:  # piper-tts 1.2
                voice.synthesize(text, wav)
        return buffer.getvalue()
