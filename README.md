# Interview Gym

A personal, local-first app for practising interviews and workplace conversations out loud. You talk to AI characters (a recruiter, a hiring manager, a senior colleague) and get a short coach report afterwards. Everything runs on your own computer: the language model, the voices and the speech recognition.

## What it does

- **Voice mode:** talk like to a person. It listens until you pause (4 seconds), replies out loud, and you can interrupt by tapping the orb.
- **Typed chat:** the same conversation with message bubbles, for when you'd rather type.
- **Coach report:** quotes from your own answers, one thing to try next, a role-specific checklist, and a fill-in template. Nothing in it is invented.
- **Voice setup:** checks your microphone, tests which speech model hears you best, and saves your own word list on this computer.
- **History:** sessions are saved locally in SQLite. Delete any of it at any time.

## Needs

- Windows, Node 20+, Python 3.12
- [Ollama](https://ollama.com) with the `qwen3.5:9b` model (`ollama pull qwen3.5:9b`)

## Run from source

```powershell
# backend (port 8001)
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt -r requirements-tts.txt -r requirements-stt.txt
.\.venv\Scripts\python -m uvicorn app.main:app --port 8001

# frontend (port 3000), in another terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Voice models are downloaded the first time they are needed. In Settings you can choose a bigger speech model (`small.en` is the default).

## Build the .exe

```powershell
pip install -r backend/requirements-build.txt   # inside the backend venv
.\build.ps1
```

This writes `dist\InterviewGym\InterviewGym.exe`. Keep it inside its folder. It still needs Ollama installed.

## Layout

- `backend/`: FastAPI app (chat, coach, speech in and out, history, voice profile)
- `frontend/`: Next.js app
- `REQUIREMENTS.md`, `DESIGN.md`: what it is for and how it should look
