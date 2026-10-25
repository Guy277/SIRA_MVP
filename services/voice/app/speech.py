"""Transcription (faster-whisper + Silero VAD intégré) et synthèse vocale (Piper). Chargés au premier usage."""
from __future__ import annotations

import io
import threading
import wave
from pathlib import Path


class SpeechUnavailable(RuntimeError):
    pass


def wav_to_mp3(wav_bytes: bytes, bitrate: int = 40_000) -> bytes:
    """WAV 16 bits de Piper → MP3 mono (FFmpeg via PyAV, déjà installé pour Whisper). Lève une erreur si ce n'est
    pas un WAV lisible : l'appelant envoie alors le WAV tel quel."""
    import av
    import numpy as np

    with wave.open(io.BytesIO(wav_bytes)) as source:
        rate, channels = source.getframerate(), source.getnchannels()
        pcm = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16)
    if channels != 1:
        pcm = pcm.reshape(-1, channels).mean(axis=1).astype(np.int16)
    out = io.BytesIO()
    with av.open(out, "w", format="mp3") as container:
        stream = container.add_stream("libmp3lame", rate=rate)
        stream.bit_rate = bitrate
        stream.layout = "mono"
        frame = av.AudioFrame.from_ndarray(pcm.reshape(1, -1), format="s16", layout="mono")
        frame.sample_rate = rate
        for packet in [*stream.encode(frame), *stream.encode(None)]:
            container.mux(packet)
    return out.getvalue()


class Transcriber:
    def __init__(self, model: str, device: str, compute_type: str, prompt_names: list[str], max_seconds: float,
                 beam_size: int = 5):
        self.model_name, self.device, self.compute_type = model, device, compute_type
        self.max_seconds, self.beam_size = max_seconds, beam_size
        # Le prompt aide Whisper à écrire les modes et les communes d'Abidjan. Il est relu à chaque phrase :
        # court (les communes seulement), il divise le temps de transcription par deux (11,8 s → 5,2 s mesurés).
        names = ", ".join(prompt_names[:15])
        self.prompt = f"Trajet à Abidjan en gbaka, wôrô-wôrô, bus SOTRA ou bateau-bus : {names}."
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
            samples, language="fr", beam_size=self.beam_size, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500}, initial_prompt=self.prompt,
            condition_on_previous_text=False,
        )
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments).strip()
        avg_logprob = sum(s.avg_logprob for s in segments) / len(segments) if segments else None
        return {"text": text, "duration_s": round(duration, 2), "speech_detected": bool(segments),
                "avg_logprob": round(avg_logprob, 3) if avg_logprob is not None else None}


    def warm(self) -> None:
        """Charge le modèle et fait une première transcription à vide (la première est toujours la plus lente)."""
        import numpy as np

        model = self._load()
        list(model.transcribe(np.zeros(16000, dtype=np.float32), language="fr", beam_size=self.beam_size)[0])


class Synthesizer:
    def __init__(self, voice_path: Path, speed: float = 1.0, speaker_id: int | None = None,
                 noise_scale: float | None = None, noise_w: float | None = None):
        self.voice_path = Path(voice_path)
        self.speed = speed
        self.speaker_id = speaker_id  # modèle à plusieurs voix (upmc : 1 = pierre)
        # Intonation : None garde les valeurs du modèle ; plus bas = voix plus régulière.
        self.noise_scale, self.noise_w = noise_scale, noise_w
        self._voice = None
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._voice is not None

    def warm(self) -> None:
        self.synthesize("Akwaba.")

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
                from piper.config import SynthesisConfig

                voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(
                    length_scale=1 / self.speed, speaker_id=self.speaker_id, noise_scale=self.noise_scale, noise_w_scale=self.noise_w))
            else:  # piper-tts 1.2
                voice.synthesize(text, wav, length_scale=1 / self.speed, speaker_id=self.speaker_id,
                                 noise_scale=self.noise_scale, noise_w=self.noise_w)
        return buffer.getvalue()
