"""Local speech-to-text (faster-whisper) so the candidate's voice never leaves this PC."""
import io
import re
import threading

from . import profile

DEFAULT_MODEL = "small.en"  # what everyone uses unless they pick another in Settings
BUNDLED_MODEL = "base.en"  # ships with the app; used until the default has been downloaded

# The models Settings and voice setup can offer. Only the bundled one comes with the app;
# the others are downloaded when the person asks for them.
MODELS: dict[str, dict] = {
    "base.en": {"label": "Standard", "size": "about 145 MB"},
    "small.en": {"label": "Better", "size": "about 480 MB"},
    "large-v3-turbo": {"label": "Best", "size": "about 1.6 GB"},
}

_loaded: dict[str, object] = {}
_lock = threading.Lock()
_downloads: dict[str, dict] = {}  # name -> {"status": "downloading" | "error", "error": str}


class STTUnavailable(RuntimeError):
    pass


class ModelNotInstalled(RuntimeError):
    pass


def is_installed(name: str) -> bool:
    try:
        from faster_whisper.utils import download_model

        download_model(name, local_files_only=True)
        return True
    except Exception:
        return False


def models_status() -> list[dict]:
    out = []
    in_use = active_model()
    for name, info in MODELS.items():
        state = _downloads.get(name, {})
        out.append(
            {
                "name": name,
                **info,
                "default": name == DEFAULT_MODEL,
                "active": name == in_use,
                "installed": is_installed(name),
                "downloading": state.get("status") == "downloading",
                "error": state.get("error", ""),
            }
        )
    return out


def start_download(name: str) -> None:
    if _downloads.get(name, {}).get("status") == "downloading":
        return
    _downloads[name] = {"status": "downloading", "error": ""}

    def work() -> None:
        try:
            from faster_whisper.utils import download_model

            download_model(name)
            _downloads.pop(name, None)
        except Exception as e:  # offline, disk full, packaged app with downloads switched off...
            _downloads[name] = {"status": "error", "error": f"Couldn't download it: {e}"}

    threading.Thread(target=work, daemon=True).start()


def active_model() -> str:
    """The person's choice, else the default; the bundled model while that isn't downloaded."""
    chosen = profile.load().get("stt_model")
    wanted = chosen if chosen in MODELS else DEFAULT_MODEL
    return wanted if is_installed(wanted) else BUNDLED_MODEL


def _get_model(name: str):
    with _lock:
        if name not in _loaded:
            try:
                from faster_whisper import WhisperModel
            except ImportError as e:
                raise STTUnavailable("Whisper is not installed. Run: pip install -r requirements-stt.txt") from e
            if name != BUNDLED_MODEL and not is_installed(name):
                raise ModelNotInstalled(name)
            _loaded[name] = WhisperModel(name, device="cpu", compute_type="int8")
        return _loaded[name]


def warm_up() -> None:
    """Load the model that will be used, so the first recording isn't slow; voice input is optional."""
    try:
        _get_model(active_model())
    except Exception:
        pass


def apply_corrections(text: str, corrections: dict[str, str]) -> str:
    for heard, meant in corrections.items():
        if heard.strip():
            text = re.sub(rf"\b{re.escape(heard)}\b", meant, text, flags=re.I)
    return text


def transcribe(audio: bytes, model: str | None = None, plain: bool = False) -> str:
    """Audio bytes in any container the decoder handles (webm/ogg/wav/mp4).

    plain=True skips the person's vocabulary and corrections, so models can be
    compared fairly during voice setup.
    """
    prof = {} if plain else profile.load()
    whisper = _get_model(model or active_model())
    vocab = [w for w in prof.get("vocabulary", []) if w.strip()]
    segments, _ = whisper.transcribe(
        io.BytesIO(audio),
        language="en",
        beam_size=5,  # considering more candidates fixes many wrong words
        # Gentle context so job-interview vocabulary and Australian spelling are preferred.
        initial_prompt="A job interview conversation in Australian English about work experience, projects, teams and results.",
        hotwords=", ".join(vocab) or None,  # names and terms from the person's profile
        vad_filter=True,  # silence would otherwise produce made-up words
        vad_parameters={"min_silence_duration_ms": 700, "speech_pad_ms": 300},  # keep word endings
        condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return text if plain else apply_corrections(text, prof.get("corrections", {}))
