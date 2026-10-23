import os
import sys
from pathlib import Path

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
CHARACTER_MODEL = os.getenv("CHARACTER_MODEL", "qwen3.5:9b")
COACH_MODEL = os.getenv("COACH_MODEL", CHARACTER_MODEL)
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")

FROZEN = bool(getattr(sys, "frozen", False))  # running as the packaged .exe


def _default_data_dir() -> Path:
    if FROZEN:  # next to the exe may be read-only (Program Files), so use the user profile
        return Path(os.getenv("LOCALAPPDATA", Path.home())) / "InterviewGym"
    return Path(__file__).resolve().parent.parent / "data"


DATA_DIR = Path(os.getenv("IG_DATA_DIR") or _default_data_dir())
# Built frontend (Next static export). When set and present, the backend serves it at "/".
STATIC_DIR = os.getenv("IG_STATIC_DIR")
