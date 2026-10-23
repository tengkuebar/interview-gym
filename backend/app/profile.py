"""The person's voice profile, kept in one JSON file in the data folder.

Written by the voice setup screen and by later corrections. Everything stays on this
machine; DELETE /api/profile removes it.
"""
import json
import threading

from .config import DATA_DIR

PROFILE_PATH = DATA_DIR / "profile.json"
_lock = threading.Lock()

DEFAULT: dict = {
    "calibrated_at": None,  # ISO time the setup was last completed
    "mic": {},  # {"label": str, "noise_floor": float}
    "stt_model": None,  # the Whisper model that scored best for this person
    "vocabulary": [],  # names, tools and terms to listen for
    "corrections": {},  # {"heard": "meant"}, applied to every transcript
    "results": [],  # [{"model": str, "accuracy": float, "seconds_per_clip": float}]
}
KEYS = set(DEFAULT)


def load() -> dict:
    with _lock:
        try:
            data = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
    return {**DEFAULT, **{k: v for k, v in data.items() if k in KEYS}}


def update(patch: dict) -> dict:
    current = load()
    current.update({k: v for k, v in patch.items() if k in KEYS})
    with _lock:
        PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        PROFILE_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current


def delete() -> bool:
    with _lock:
        existed = PROFILE_PATH.exists()
        PROFILE_PATH.unlink(missing_ok=True)
    return existed
