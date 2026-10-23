"""Local SQLite storage for practice sessions. Everything stays on this machine."""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DATA_DIR

DB_PATH = DATA_DIR / "interview_gym.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    persona_id TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    persona_role TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    context TEXT
);
CREATE TABLE IF NOT EXISTS message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report (
    session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
    json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_created ON session(created_at DESC);
"""


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def save_session(
    *,
    persona_id: str,
    persona_name: str,
    persona_role: str,
    difficulty: str,
    context: str | None,
    messages: list[dict],
    report: dict,
) -> str:
    session_id = uuid.uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as c:
        c.execute(
            "INSERT INTO session (id, created_at, persona_id, persona_name, persona_role, difficulty, context)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, created_at, persona_id, persona_name, persona_role, difficulty, context),
        )
        c.executemany(
            "INSERT INTO message (session_id, idx, role, content) VALUES (?, ?, ?, ?)",
            [(session_id, i, m["role"], m["content"]) for i, m in enumerate(messages)],
        )
        c.execute("INSERT INTO report (session_id, json) VALUES (?, ?)", (session_id, json.dumps(report)))
    return session_id


def list_sessions() -> list[dict]:
    with connect() as c:
        rows = c.execute(
            "SELECT s.id, s.created_at, s.persona_name, s.persona_role, s.difficulty, r.json AS report_json,"
            " (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id AND m.role = 'user') AS answers"
            " FROM session s LEFT JOIN report r ON r.session_id = s.id"
            " ORDER BY s.created_at DESC"
        ).fetchall()
    out = []
    for r in rows:
        report = json.loads(r["report_json"]) if r["report_json"] else {}
        out.append(
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "persona_name": r["persona_name"],
                "persona_role": r["persona_role"],
                "difficulty": r["difficulty"],
                "headline": report.get("headline", ""),
                "answers": r["answers"],
            }
        )
    return out


def get_session(session_id: str) -> dict | None:
    with connect() as c:
        s = c.execute("SELECT * FROM session WHERE id = ?", (session_id,)).fetchone()
        if s is None:
            return None
        msgs = c.execute(
            "SELECT role, content FROM message WHERE session_id = ? ORDER BY idx", (session_id,)
        ).fetchall()
        r = c.execute("SELECT json FROM report WHERE session_id = ?", (session_id,)).fetchone()
    return {
        "id": s["id"],
        "created_at": s["created_at"],
        "persona_name": s["persona_name"],
        "persona_role": s["persona_role"],
        "difficulty": s["difficulty"],
        "messages": [dict(m) for m in msgs],
        "report": {**json.loads(r["json"]), "session_id": s["id"]} if r else None,
    }


def delete_session(session_id: str) -> bool:
    with connect() as c:
        return c.execute("DELETE FROM session WHERE id = ?", (session_id,)).rowcount > 0


def delete_all() -> int:
    with connect() as c:
        return c.execute("DELETE FROM session").rowcount
