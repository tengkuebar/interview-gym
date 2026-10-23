"""Kokoro TTS behind a tiny interface so the engine can be swapped later."""
import io
import threading

# Voices grouped for the UI. Prefix: a=American, b=British; f=female, m=male.
VOICES = [
    {"id": "bf_emma", "label": "Emma (British, female)"},
    {"id": "bf_isabella", "label": "Isabella (British, female)"},
    {"id": "bf_alice", "label": "Alice (British, female)"},
    {"id": "bf_lily", "label": "Lily (British, female)"},
    {"id": "bm_george", "label": "George (British, male)"},
    {"id": "bm_lewis", "label": "Lewis (British, male)"},
    {"id": "bm_daniel", "label": "Daniel (British, male)"},
    {"id": "bm_fable", "label": "Fable (British, male)"},
    {"id": "af_heart", "label": "Heart (American, female)"},
    {"id": "af_bella", "label": "Bella (American, female)"},
    {"id": "am_michael", "label": "Michael (American, male)"},
    {"id": "am_adam", "label": "Adam (American, male)"},
]

_pipelines: dict[str, object] = {}
_lock = threading.Lock()


class TTSUnavailable(RuntimeError):
    pass


def _get_pipeline(voice: str):
    lang = voice[0]  # 'a' or 'b'
    with _lock:
        if lang not in _pipelines:
            try:
                from kokoro import KPipeline
            except ImportError as e:
                raise TTSUnavailable(
                    "Kokoro is not installed. Run: pip install -r requirements-tts.txt"
                ) from e
            _pipelines[lang] = KPipeline(lang_code=lang)
        return _pipelines[lang]


def warm_up() -> None:
    """Load the model once at startup so the first spoken reply isn't slow."""
    try:
        synthesize("Hello.", voice="bf_emma")
    except Exception:
        pass  # voice is optional; the app works text-only without it


def synthesize(text: str, voice: str = "bf_emma", speed: float = 1.0) -> bytes:
    """Return WAV bytes (24 kHz mono) for the given text."""
    import numpy as np
    import soundfile as sf

    pipeline = _get_pipeline(voice)
    parts = [audio for _, _, audio in pipeline(text, voice=voice, speed=speed)]
    if not parts:
        raise ValueError("No audio generated")
    audio = np.concatenate([p.numpy() if hasattr(p, "numpy") else p for p in parts])
    buf = io.BytesIO()
    sf.write(buf, audio, 24000, format="WAV")
    return buf.getvalue()
