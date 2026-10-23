"""Entry point for the packaged app (InterviewGym.exe).

Starts the local server, makes sure Ollama and the model are there, then opens the
browser. Run from source with:  python launcher.py
"""
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
PORT = int(os.getenv("IG_PORT", "8001"))

# Models ship next to the exe so the first run needs no internet.
if getattr(sys, "frozen", False):
    models = HERE / "models"
    if models.is_dir():
        os.environ.setdefault("HF_HOME", str(models))
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("IG_STATIC_DIR", str(HERE / "web"))

from app.config import CHARACTER_MODEL, OLLAMA_URL  # noqa: E402  (after the environment is set)


def say(msg: str = "") -> None:
    print(msg, flush=True)


def ollama_models() -> list[str] | None:
    """Model names Ollama has, or None if Ollama isn't answering."""
    try:
        import json

        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as r:
            return [m["name"] for m in json.load(r).get("models", [])]
    except Exception:
        return None


def ensure_ollama() -> bool:
    models = ollama_models()
    if models is None and shutil.which("ollama"):
        say("Starting Ollama...")
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for _ in range(30):
            time.sleep(1)
            models = ollama_models()
            if models is not None:
                break
    if models is None:
        say("Ollama isn't installed or isn't running.")
        say("Install it from https://ollama.com/download, then start Interview Gym again.")
        return False
    if not any(m == CHARACTER_MODEL or m.split(":")[0] == CHARACTER_MODEL for m in models):
        say(f"The AI model '{CHARACTER_MODEL}' isn't installed yet.")
        say(f"Open a terminal and run:  ollama pull {CHARACTER_MODEL}")
        say("Then start Interview Gym again.")
        return False
    return True


def open_when_ready(url: str) -> None:
    for _ in range(120):
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    say(f"Interview Gym is ready at {url}")
    if not os.getenv("IG_NO_BROWSER"):
        webbrowser.open(url)


def main() -> int:
    say("Interview Gym")
    say("-------------")
    if not ensure_ollama():
        try:  # keep the window open long enough to read the message
            input("\nPress Enter to close.")
        except (EOFError, OSError):
            pass
        return 1

    url = f"http://localhost:{PORT}"
    threading.Thread(target=open_when_ready, args=(url,), daemon=True).start()
    say("Starting... (keep this window open; close it to quit)")

    import uvicorn
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
