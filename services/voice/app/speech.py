"""Transcription (faster-whisper + Silero VAD intégré) et synthèse vocale (Piper). Chargés au premier usage."""
from __future__ import annotations

import io
import re
import threading
import wave
import zlib
from collections import OrderedDict
from collections.abc import Callable, Iterable
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

# Fin de phrase : « . », « ? », « ! » ou « … » suivi d'une nouvelle phrase (majuscule, chiffre, guillemet).
_SENTENCE_END = re.compile(r"(?<=[.?!…])\s+(?=[A-ZÀ-Ý0-9«])")


def is_repetitive(text: str) -> bool:
    """Whisper qui boucle : « … Adjamé Adjamé Adjamé Adjamé … ». Même règle que Whisper (texte qui se compresse
    plus de 2,4 fois), plus un groupe de 1 à 4 mots répété au moins 4 fois de suite."""
    words = re.findall(r"\w+", (text or "").lower())
    if len(words) < 8:
        return False
    raw = " ".join(words).encode("utf-8")
    if len(raw) / max(len(zlib.compress(raw)), 1) > 2.4:
        return True
    for size in range(1, 5):
        for start in range(0, len(words) - size * 4 + 1):
            group = words[start:start + size]
            if all(words[start + k * size:start + (k + 1) * size] == group for k in range(1, 4)):
                return True
    return False


def collapse_repeats(text: str) -> str:
    """Garde une seule fois un groupe de 1 à 4 mots répété de suite (« Plateau Plateau Plateau » → « Plateau »)."""
    words = (text or "").split()
    size = 4
    while size >= 1:
        out, i = [], 0
        while i < len(words):
            group = words[i:i + size]
            out += group
            i += size
            while len(group) == size and [w.lower().strip(".,!?") for w in words[i:i + size]] == [w.lower().strip(".,!?") for w in group]:
                i += size
        words, size = out, size - 1
    return " ".join(words)


def split_sentences(text: str) -> list[str]:
    """« Le plus rapide… : le gbaka. 500 francs, 35 minutes. » → une phrase par élément, dans l'ordre."""
    return [part for part in (piece.strip() for piece in _SENTENCE_END.split(text or "")) if part]


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


class SpokenCache:
    """La voix de SIRA déjà produite, phrase par phrase (les plus récentes, en mémoire seulement).

    - `get` rend la voix d'une phrase : tout de suite si elle est prête, sinon produite sur place ;
    - `prepare` la fait produire en arrière-plan : les phrases fixes au démarrage, la suite d'une réponse pendant que
      l'application joue la première phrase. Une phrase demandée pendant sa préparation attend juste la fin de celle-ci.
    """

    def __init__(self, produce: Callable[[str], tuple[bytes, str]], size: int = 256):
        self._produce = produce
        self._size = size
        self._items: OrderedDict[str, Future] = OrderedDict()
        self._lock = threading.Lock()
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice-tts")

    def __len__(self) -> int:
        return len(self._items)

    def _claim(self, text: str) -> tuple[Future, bool]:
        """La place de la phrase dans le cache ; True si c'est à l'appelant de la produire."""
        with self._lock:
            known = self._items.get(text)
            if known is not None:
                self._items.move_to_end(text)
                return known, False
            future: Future = Future()
            self._items[text] = future
            while len(self._items) > self._size:
                self._items.popitem(last=False)
            return future, True

    def _fill(self, text: str, future: Future) -> None:
        try:
            future.set_result(self._produce(text))
        except BaseException as error:  # voix absente… : on n'en garde pas la trace, la phrase sera retentée
            with self._lock:
                if self._items.get(text) is future:
                    del self._items[text]
            future.set_exception(error)

    def get(self, text: str) -> tuple[bytes, str]:
        text = text.strip()
        future, mine = self._claim(text)
        if mine:
            self._fill(text, future)
        return future.result()

    def prepare(self, texts: Iterable[str]) -> None:
        for text in texts:
            text = text.strip()
            if text:
                future, mine = self._claim(text)
                if mine:
                    self._worker.submit(self._fill, text, future)


class ParakeetTranscriber:
    """Transcription rapide : Parakeet TDT 0.6B v3 (int8 ONNX, onnx-asr). Environ 8 fois plus rapide que Whisper small
    sur processeur, mais sans prompt : il écrit plus mal les noms d'Abidjan (« Jami » pour Adjamé). Le service le passe
    en premier et garde Whisper en secours (main.py)."""

    MODEL = "nemo-parakeet-tdt-0.6b-v3"

    def __init__(self, model_dir: Path, max_seconds: float):
        self.model_dir, self.max_seconds = Path(model_dir), max_seconds
        self._model = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return (self.model_dir / "encoder-model.int8.onnx").exists()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        with self._lock:
            if self._model is None:
                if not self.available:
                    raise SpeechUnavailable(f"Parakeet introuvable : {self.model_dir} (npm run voice:setup)")
                try:
                    import onnx_asr
                except ImportError as error:
                    raise SpeechUnavailable("onnx-asr n'est pas installé (npm run voice:setup)") from error
                self._model = onnx_asr.load_model(self.MODEL, str(self.model_dir), quantization="int8")
        return self._model

    def warm(self) -> None:
        import numpy as np

        self._load().recognize(np.zeros(16000, dtype=np.float32), sample_rate=16000)

    def transcribe(self, audio: bytes) -> dict:
        model = self._load()
        from faster_whisper import decode_audio  # lecture webm, ogg, m4a, wav… via PyAV, comme pour Whisper

        samples = decode_audio(io.BytesIO(audio), sampling_rate=16000)
        duration = len(samples) / 16000
        if duration > self.max_seconds:
            raise ValueError(f"Audio trop long ({duration:.0f} s, maximum {self.max_seconds:.0f} s)")
        text = (model.recognize(samples, sample_rate=16000) or "").strip()
        return {"text": text, "duration_s": round(duration, 2), "speech_detected": bool(text), "avg_logprob": None}


class Transcriber:
    def __init__(self, model: str, device: str, compute_type: str, prompt_names: list[str], max_seconds: float,
                 beam_size: int = 5, temperature: float = 0.0, tokens_per_second: float = 8.0):
        self.model_name, self.device, self.compute_type = model, device, compute_type
        self.max_seconds, self.beam_size = max_seconds, beam_size
        self.temperature, self.tokens_per_second = temperature, tokens_per_second
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
            # Garde-fous (config.py) : une seule température, et pas plus de mots que la phrase n'en contient.
            temperature=self.temperature, max_new_tokens=self.max_tokens(duration),
        )
        segments = list(segments)
        text = " ".join(s.text.strip() for s in segments).strip()
        avg_logprob = sum(s.avg_logprob for s in segments) / len(segments) if segments else None
        repetitive = is_repetitive(text)
        return {"text": collapse_repeats(text) if repetitive else text, "duration_s": round(duration, 2),
                "speech_detected": bool(segments), "repetitive": repetitive,
                "avg_logprob": round(avg_logprob, 3) if avg_logprob is not None else None}

    def max_tokens(self, duration_s: float) -> int:
        """Plafond de jetons pour une phrase de cette durée (Whisper n'en accepte pas plus de 224 par fenêtre)."""
        return int(min(224, 16 + self.tokens_per_second * duration_s))


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
