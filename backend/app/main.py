import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, profile, stt, tts
from .assist import make_assist
from .coach import Report, make_report
from .config import CHARACTER_MODEL, FRONTEND_ORIGINS, STATIC_DIR
from .llm import stream_chat
from .personas import PERSONAS, get_persona

@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=tts.warm_up, daemon=True).start()
    threading.Thread(target=stt.warm_up, daemon=True).start()
    yield


app = FastAPI(title="Interview Gym", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


DIFFICULTY_NOTES = {
    "gentle": (
        "Difficulty: gentle. Be encouraging and patient. Keep questions simple, "
        "accept short answers, and give the candidate time. Ask at most one light follow-up."
    ),
    "realistic": (
        "Difficulty: realistic. Behave like a typical professional. Ask natural follow-ups "
        "and gently probe vague answers."
    ),
    "tough": (
        "Difficulty: tough. Be brisk and sceptical. Probe vague answers hard, ask for "
        "specifics and numbers, and move on quickly if an answer rambles."
    ),
}


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    persona_id: str
    messages: list[Message]
    difficulty: Literal["gentle", "realistic", "tough"] = "realistic"
    context: str | None = None  # e.g. pasted job ad


class TTSRequest(BaseModel):
    text: str
    voice: str = "bf_emma"
    speed: float = 1.0


@app.get("/api/health")
def health():
    return {"ok": True, "model": CHARACTER_MODEL}


@app.get("/api/personas")
def personas():
    hidden = {"system_prompt", "speaker_label", "coach_brief", "metric_notes", "checks_title", "checks"}
    return [p.model_dump(exclude=hidden) for p in PERSONAS]


@app.get("/api/voices")
def voices():
    return tts.VOICES


@app.post("/api/chat")
async def chat(req: ChatRequest):
    persona = get_persona(req.persona_id)
    if persona is None:
        raise HTTPException(404, "Unknown persona")

    system = persona.system_prompt + "\n\n" + DIFFICULTY_NOTES[req.difficulty]
    if req.context:
        system += f"\n\nBackground for this conversation (the role/job being discussed):\n{req.context}"

    messages = [{"role": "system", "content": system}]
    messages += [m.model_dump() for m in req.messages]
    # Let the character open the conversation when there is no user message yet.
    if not req.messages:
        messages.append({"role": "user", "content": "(The conversation begins. Greet the candidate.)"})

    async def gen():
        # Hard guard for "one question per turn": the model is told to end on its
        # question, so cut the stream right after the first question mark.
        async for token in stream_chat(CHARACTER_MODEL, messages, think=False):
            if "?" in token:
                yield token[: token.index("?") + 1]
                return
            yield token

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@app.post("/api/coach", response_model=Report)
async def coach(req: ChatRequest):
    persona = get_persona(req.persona_id)
    if persona is None:
        raise HTTPException(404, "Unknown persona")
    messages = [m.model_dump() for m in req.messages]
    if sum(1 for m in messages if m["role"] == "user") < 2:
        raise HTTPException(422, "Answer at least two questions first, then ask for feedback.")
    try:
        report = await make_report(persona, req.difficulty, messages, req.context)
    except Exception as e:
        raise HTTPException(502, f"The coach could not produce a report: {e}")
    session_id = await run_in_threadpool(
        db.save_session,
        persona_id=persona.id,
        persona_name=persona.name,
        persona_role=persona.role,
        difficulty=req.difficulty,
        context=req.context,
        messages=messages,
        report=report.model_dump(exclude={"session_id"}),
    )
    return report.model_copy(update={"session_id": session_id})


class AssistRequest(ChatRequest):
    kind: Literal["hint", "reply"]


@app.post("/api/assist")
async def assist(req: AssistRequest):
    persona = get_persona(req.persona_id)
    if persona is None:
        raise HTTPException(404, "Unknown persona")
    messages = [m.model_dump() for m in req.messages if m.content.strip()]
    if not messages or messages[-1]["role"] != "assistant":
        raise HTTPException(422, f"Wait for {persona.name} to finish asking, then try again.")
    try:
        text = await make_assist(req.kind, persona, req.difficulty, messages, req.context)
    except Exception as e:
        raise HTTPException(502, f"Couldn't come up with that just now: {e}")
    return {"kind": req.kind, "text": text}


class SessionSummary(BaseModel):
    id: str
    created_at: str
    persona_name: str
    persona_role: str
    difficulty: str
    headline: str
    answers: int


class SessionDetail(BaseModel):
    id: str
    created_at: str
    persona_name: str
    persona_role: str
    difficulty: str
    messages: list[Message]
    report: Report | None


@app.get("/api/sessions", response_model=list[SessionSummary])
async def sessions():
    return await run_in_threadpool(db.list_sessions)


@app.get("/api/sessions/{session_id}", response_model=SessionDetail)
async def session_detail(session_id: str):
    found = await run_in_threadpool(db.get_session, session_id)
    if found is None:
        raise HTTPException(404, "Session not found")
    return found


@app.delete("/api/sessions/{session_id}")
async def session_delete(session_id: str):
    if not await run_in_threadpool(db.delete_session, session_id):
        raise HTTPException(404, "Session not found")
    return {"deleted": 1}


@app.delete("/api/sessions")
async def sessions_delete_all():
    return {"deleted": await run_in_threadpool(db.delete_all)}


@app.post("/api/stt")
async def transcribe(file: UploadFile, model: str | None = Form(None), plain: bool = Form(False)):
    """model and plain are for voice setup: compare models without the person's vocabulary."""
    if model is not None and model not in stt.MODELS:
        raise HTTPException(422, "Unknown model")
    audio = await file.read()
    if not audio:
        raise HTTPException(422, "No audio received")
    if len(audio) > 10_000_000:
        raise HTTPException(413, "That recording is too long. Keep it under a few minutes.")
    used = model or stt.active_model()
    started = time.perf_counter()
    try:
        text = await run_in_threadpool(stt.transcribe, audio, used, plain)
    except stt.ModelNotInstalled:
        raise HTTPException(409, "That model isn't downloaded yet.")
    except stt.STTUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception:
        logging.getLogger("uvicorn.error").exception("Transcription failed")
        raise HTTPException(422, "Couldn't read that recording. Try again.")
    return {"text": text, "model": used, "seconds": round(time.perf_counter() - started, 2)}


@app.get("/api/stt/models")
async def stt_models():
    return await run_in_threadpool(stt.models_status)


@app.post("/api/stt/models/{name}/download")
async def stt_model_download(name: str):
    if name not in stt.MODELS:
        raise HTTPException(404, "Unknown model")
    stt.start_download(name)
    return {"started": name}


class ProfilePatch(BaseModel):
    calibrated_at: str | None = None
    mic: dict | None = None
    stt_model: str | None = None
    vocabulary: list[str] | None = None
    corrections: dict[str, str] | None = None
    results: list[dict] | None = None


@app.get("/api/profile")
async def profile_get():
    return await run_in_threadpool(profile.load)


@app.put("/api/profile")
async def profile_put(patch: ProfilePatch):
    data = patch.model_dump(exclude_unset=True)
    if data.get("stt_model") not in (None, *stt.MODELS):
        raise HTTPException(422, "Unknown model")
    if "vocabulary" in data:  # tidy: trimmed, short, no repeats, capped
        seen: list[str] = []
        for w in data["vocabulary"] or []:
            w = w.strip()[:40]
            if w and w.lower() not in (x.lower() for x in seen):
                seen.append(w)
        data["vocabulary"] = seen[:200]
    if "corrections" in data:
        data["corrections"] = {
            k.strip()[:40]: v.strip()[:40]
            for k, v in list((data["corrections"] or {}).items())[:200]
            if k.strip() and v.strip()
        }
    return await run_in_threadpool(profile.update, data)


@app.delete("/api/profile")
async def profile_delete():
    return {"deleted": await run_in_threadpool(profile.delete)}


@app.post("/api/tts")
async def speak(req: TTSRequest):
    if req.voice not in {v["id"] for v in tts.VOICES}:
        raise HTTPException(422, "Unknown voice")
    if not req.text.strip() or len(req.text) > 1500:
        raise HTTPException(422, "Text must be between 1 and 1500 characters")
    try:
        wav = await run_in_threadpool(tts.synthesize, req.text, req.voice, req.speed)
    except tts.TTSUnavailable as e:
        raise HTTPException(503, str(e))
    return Response(content=wav, media_type="audio/wav")


# Packaged app: serve the built frontend from the same origin. Added last so /api routes win.
if STATIC_DIR and Path(STATIC_DIR).is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
