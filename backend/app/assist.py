"""In-session help for the candidate: a nudge (hint) or a draft answer (suggest a reply).

This is a separate call from the character, so the interviewer never breaks role.
Neither result is shown to the coach or counted in the report.
"""
import re

from .config import COACH_MODEL
from .llm import chat_text
from .personas import Persona

HINT_SYSTEM = """You are a calm, encouraging interview coach whispering a quick hint to a candidate who feels nervous.
You will see the practice conversation so far. The interviewer has just asked a question.

Give ONE hint of at most 30 words about how to approach answering that question: what to include or how to structure it.
Rules:
- Speak to the candidate as "you".
- Do NOT write the answer or give example wording.
- Do not repeat the question. No greeting, no markdown, no list."""

REPLY_SYSTEM = """You help a nervous candidate in an interview practice session by drafting a sample answer they can edit.
You will see the conversation so far. The interviewer has just asked a question.

Write the candidate's possible answer in the first person, as natural spoken English.
Rules:
- 2 to 4 short sentences, under 70 words.
- You do not know the candidate's real experience. Never invent employers, job titles, tools, projects, activities, numbers, dates or achievements. If the candidate has not said it earlier in the conversation, it must be a placeholder.
- Use [square bracket placeholders] for anything personal, for example [a specific project], [what you did], [the result].
- Style example (for a question about a time something paid off): "One time was [a specific project]. I [what you did], and the result was [the result]."
- Do not add any claim about the candidate's life, feelings, preparation or opinions that they have not already stated. For small talk, keep it simple and polite, and turn the conversation back with a question.
- Stay consistent with anything the candidate already said earlier in the conversation.
- Output only the answer text. No quotation marks, no labels, no markdown."""


def _transcript(persona: Persona, messages: list[dict], limit: int = 10) -> str:
    lines = []
    for m in messages[-limit:]:
        who = f"{persona.speaker_label} ({persona.name}, {persona.role})" if m["role"] == "assistant" else "Candidate"
        lines.append(f"{who}: {m['content']}")
    return "\n".join(lines)


def _clean(text: str) -> str:
    text = re.sub(r"[*_`#>]+", "", text).strip()
    return text.strip("\"'“” ").strip()


async def make_assist(
    kind: str, persona: Persona, difficulty: str, messages: list[dict], context: str | None
) -> str:
    prompt = f"Practice conversation so far:\n\n{_transcript(persona, messages)}"
    if context:
        prompt += f"\n\nThe role being discussed:\n{context}"
    system = HINT_SYSTEM if kind == "hint" else REPLY_SYSTEM
    out = await chat_text(
        COACH_MODEL,
        [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        temperature=0.4 if kind == "hint" else 0.7,
    )
    out = _clean(out)
    if not out:
        raise ValueError("Empty response")
    return out
