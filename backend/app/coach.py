"""Post-session coach: LLM judgement for the soft parts, plain code for the numbers.

Every quote the model returns must appear word for word in the candidate's own
answers, otherwise it is dropped (and the call is retried once).
"""
import re

from pydantic import BaseModel, ValidationError

from .config import COACH_MODEL
from .llm import chat_structured
from .personas import Persona


class QuoteItem(BaseModel):
    point: str
    quote: str


class FocusArea(BaseModel):
    point: str
    quote: str
    try_next: str


class Star(BaseModel):  # reports saved before per-role checks existed
    situation: bool
    task: bool
    action: bool
    result: bool


class Check(BaseModel):
    name: str
    met: bool


class Rewrite(BaseModel):
    original: str
    improved: str


class CoachDraft(BaseModel):
    headline: str
    summary: str
    strengths: list[QuoteItem]
    focus_area: FocusArea
    checks: list[Check]


class Metrics(BaseModel):
    filler_words: int
    hedges: int
    questions_asked_back: int
    talk_ratio_user: float


class Report(BaseModel):
    session_id: str | None = None
    persona_id: str
    persona_name: str
    persona_role: str
    difficulty: str
    headline: str
    summary: str
    strengths: list[QuoteItem]
    focus_area: FocusArea
    star: Star | None = None
    checks_title: str = ""
    checks: list[Check] = []
    fill_in: str = ""
    rewrite: Rewrite | None = None  # only on reports saved before fill-in templates
    metrics: Metrics


FILLER_RE = re.compile(r"\b(um+|uh+|erm?|you know|i mean|basically|literally)\b", re.I)
HEDGE_RE = re.compile(
    r"\b(kind of|sort of|maybe|i guess|i think|probably|perhaps|i suppose|not sure|a bit)\b", re.I
)

COACH_SYSTEM = """You are a kind, specific communication coach for people who find social situations draining.
You will read a practice conversation between a role-played character and a candidate, then give feedback to the candidate.

Rules:
- Speak to the candidate as "you". Be warm and concrete. Never give a score or a grade.
- Only judge the candidate's lines, never the character's.
- Every "quote" field must be copied word for word from a single line the candidate said. Do not paraphrase, fix grammar, or combine lines.
- Give 1 to 3 strengths. Lead with what worked. Each strength needs a quote that shows it. If the candidate said very little, give just one strength rather than padding.
- Give exactly one focus area: the single most useful thing to improve, with a quote, and a concrete "try_next" action in one or two sentences.
- Any example wording you suggest in "try_next" must not add actions, events, numbers or reasons the candidate did not mention. Put each missing detail in [square brackets], for example "I [what you did] and sent [what] to the team".
- Keep "focus_area" consistent with the checks: do not tell the candidate to cut something that a check says they did not do.
- "headline" is a short, kind sentence under 10 words. "summary" is at most two sentences.
- Use Australian English spelling. Plain text only, no markdown."""

DIFFICULTY_COACHING = {
    "gentle": "The candidate chose gentle mode. Be extra encouraging and keep the focus area small and easy to act on.",
    "realistic": "The candidate chose realistic mode. Be balanced: honest about gaps, but kind.",
    "tough": "The candidate chose tough mode. Be direct and specific about vague or rambling answers, while staying kind.",
}


def coach_system(persona: Persona, difficulty: str) -> str:
    parts = [COACH_SYSTEM, "\nAbout this conversation:", persona.coach_brief]
    if persona.metric_notes:
        parts.append(persona.metric_notes)
    parts.append(DIFFICULTY_COACHING.get(difficulty, ""))
    if persona.checks:
        items = "\n".join(f"- {c[0]}: {c[1]}" for c in persona.checks)
        parts.append(
            '\n"checks": return exactly these items, in this order, using these exact names. '
            "Set met to true only if the candidate clearly did it in at least one answer. "
            "If you are unsure, or they said too little to tell, set it to false.\n" + items
        )
    return "\n".join(p for p in parts if p)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", re.sub(r"\s+", " ", text.lower())).strip()


def compute_metrics(messages: list[dict]) -> Metrics:
    user_text = " ".join(m["content"] for m in messages if m["role"] == "user")
    all_words = sum(len(m["content"].split()) for m in messages)
    user_words = len(user_text.split())
    return Metrics(
        filler_words=len(FILLER_RE.findall(user_text)),
        hedges=len(HEDGE_RE.findall(user_text)),
        questions_asked_back=user_text.count("?"),
        talk_ratio_user=round(user_words / all_words, 2) if all_words else 0.0,
    )


def _transcript(persona: Persona, messages: list[dict]) -> str:
    lines = []
    for m in messages:
        who = f"{persona.speaker_label} ({persona.name}, {persona.role})" if m["role"] == "assistant" else "Candidate"
        lines.append(f"{who}: {m['content']}")
    return "\n".join(lines)


def _quote_ok(quote: str, user_norm: str) -> bool:
    q = _norm(quote)
    return len(q) >= 8 and q in user_norm


COMMON_WORDS = set(
    """that this with have from your they them then will just more what when where which would could should
    about also into over very some each make made like been were being their there here than only much many
    other after before because while since still even such most both same does doing done going gone come came
    want need know take took give gave said says tell told ask asked asking thing things really maybe able
    clear clearly simple simply quick quickly short shortly briefly better best good great confident confidently
    directly direct specific specifically detail details sure help helps helped happy glad thanks thank please
    first next last time times back keep kept learn learned example within without across through during
    always never often sometimes usually""".split()
)
MAX_NEW_WORDS = 1
# Wording the coach suggests inside quotation marks (double, curly, or single not part of a contraction).
SUGGESTED_RE = re.compile(r"[\"“]([^\"”]{12,})[\"”]|(?<![A-Za-z])'([^']{12,}?)'(?![A-Za-z])")


def _stems(text: str) -> set[str]:
    return {w[:4] for w in _norm(text).split() if len(w) >= 4}


def new_content_words(text: str, allowed_text: str) -> list[str]:
    """Words that appear nowhere in the conversation: a sign the model invented
    actions or facts instead of using what the candidate said."""
    allowed = _stems(allowed_text)
    text = re.sub(r"\[[^\]]*\]", " ", text)
    return [w for w in _norm(text).split() if len(w) >= 4 and w not in COMMON_WORDS and w[:4] not in allowed]


def _invented_examples(try_next: str, allowed_text: str) -> list[str]:
    """Quoted example wording in the advice that brings in new facts."""
    bad = []
    for m in SUGGESTED_RE.finditer(try_next):
        example = m.group(1) or m.group(2)
        if len(new_content_words(example, allowed_text)) > MAX_NEW_WORDS:
            bad.append(m.group(0))
    return bad


def _clean_try_next(try_next: str, allowed_text: str) -> str:
    """Remove any sentence whose quoted example invents details."""
    bad = _invented_examples(try_next, allowed_text)
    if not bad:
        return try_next
    sentences = re.split(r"(?<=[.!?])\s+", try_next.strip())
    kept = [s for s in sentences if not any(b in s for b in bad)]
    return " ".join(kept) or "Use the shape below to add the missing parts in your own words."


def _validate(draft: CoachDraft, user_norm: str, allowed_text: str) -> tuple[CoachDraft, bool]:
    """Drop strengths with fake quotes. Returns (draft, fully_grounded)."""
    strengths = [s for s in draft.strengths if _quote_ok(s.quote, user_norm)]
    grounded = (
        bool(strengths)
        and _quote_ok(draft.focus_area.quote, user_norm)
        and not _invented_examples(draft.focus_area.try_next, allowed_text)
    )
    return draft.model_copy(update={"strengths": strengths}), grounded


def _checks(persona: Persona, returned: list[Check]) -> list[Check]:
    """Always the persona's own checklist, in order; anything the model skipped is not met."""
    by_name = {_norm(c.name): c.met for c in returned}
    return [Check(name=c[0], met=by_name.get(_norm(c[0]), False)) for c in persona.checks]


def _fill_in(persona: Persona, checks: list[Check]) -> str:
    """A skeleton answer made of the parts the candidate has not covered yet.
    Written by us, not the model, so it can never contain invented facts."""
    met = {c.name: c.met for c in checks}
    missing = [c[2] for c in persona.checks if not met.get(c[0], False)]
    # With one or no gaps, show the whole shape so it still reads like an answer.
    parts = missing if len(missing) >= 2 else [c[2] for c in persona.checks]
    return " ".join(parts)


def _tidy_headline(headline: str) -> str:
    """The prompt asks for under 10 words; if the model runs long, keep the first clause."""
    headline = headline.strip()
    if len(headline.split()) <= 12:
        return headline
    first = re.split(r"[,;:—]|\s-\s", headline, maxsplit=1)[0].strip()
    return first if len(first.split()) >= 3 else headline


async def make_report(
    persona: Persona, difficulty: str, messages: list[dict], context: str | None
) -> Report:
    user_norm = _norm(" ".join(m["content"] for m in messages if m["role"] == "user"))
    # Everything said in the conversation (and the job ad) counts as known.
    allowed_text = " ".join(m["content"] for m in messages) + " " + (context or "")
    prompt = f"Practice conversation:\n\n{_transcript(persona, messages)}"
    if context:
        prompt += (
            f"\n\nThe role being discussed:\n{context}\n\n"
            "Where it fits, note whether the candidate's answers connected to this role."
        )
    chat = [
        {"role": "system", "content": coach_system(persona, difficulty)},
        {"role": "user", "content": prompt},
    ]
    schema = CoachDraft.model_json_schema()

    best: CoachDraft | None = None
    for _ in range(2):
        raw = await chat_structured(COACH_MODEL, chat, schema)
        try:
            draft = CoachDraft.model_validate_json(raw)
        except ValidationError:
            continue
        draft, grounded = _validate(draft, user_norm, allowed_text)
        best = draft
        if grounded:
            break
    if best is None:
        raise ValueError("The coach could not produce a report")

    focus = best.focus_area
    if not _quote_ok(focus.quote, user_norm):
        focus = focus.model_copy(update={"quote": ""})
    focus = focus.model_copy(update={"try_next": _clean_try_next(focus.try_next, allowed_text)})
    checks = _checks(persona, best.checks)

    return Report(
        persona_id=persona.id,
        persona_name=persona.name,
        persona_role=persona.role,
        difficulty=difficulty,
        headline=_tidy_headline(best.headline),
        summary=best.summary,
        strengths=best.strengths,
        focus_area=focus,
        checks_title=persona.checks_title if persona.checks else "",
        checks=checks,
        fill_in=_fill_in(persona, checks),
        metrics=compute_metrics(messages),
    )
