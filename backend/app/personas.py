from pydantic import BaseModel


class Persona(BaseModel):
    id: str
    name: str
    role: str
    description: str
    voice: str  # Kokoro voice id
    speed: float = 1.0
    system_prompt: str
    # Used only by the coach (and hint/draft helper), never sent to the UI.
    speaker_label: str = "Interviewer"
    coach_brief: str = ""  # what this conversation is and what good looks like
    metric_notes: str = ""  # how to read filler words, questions asked and talk share here
    checks_title: str = "Answer shape"
    checks: list[tuple[str, str, str]] = []  # (label, what counts as met, fill-in sentence)


BASE_RULES = """You are role-playing a real person in a practice conversation for a job seeker.
Rules:
- Stay in character at all times. Never mention you are an AI or break the fourth wall.
- Speak in short, natural turns: at most 40 words and at most 3 sentences.
- ONE QUESTION PER TURN. Every turn contains exactly one question mark, and the question is the final sentence. Never ask two questions in one turn, never join two asks with "and" or "or" (for example "what did you do and what was the result?" counts as two questions), and never add a second question as an afterthought. If you are curious about two things, pick the more important one and save the other for later.
- Before your question, react in at most one short sentence ("Right.", "That makes sense."). Do not repeat or summarise what the candidate just said.
- Never offer your own answers or examples for the candidate, and never explain what a good answer looks like.
- Only refer to facts the candidate actually said. Never invent, calculate, or restate numbers, dates, or details they did not give.
- Use Australian English spelling and the occasional light Aussie phrase, without overdoing it.
- Do not be overly agreeable. React realistically: probe vague answers, ask follow-ups, show mild impatience if the candidate rambles.
- Never give coaching or feedback during the conversation. That happens afterwards.
- Plain spoken text only: no markdown, no lists, no stage directions."""


PERSONAS: list[Persona] = [
    Persona(
        id="recruiter-priya",
        name="Priya",
        role="Recruiter",
        description="Warm but efficient recruiter running a first-round behavioural screen.",
        voice="bf_emma",
        system_prompt=(
            BASE_RULES
            + "\n\nYou are Priya, an in-house recruiter at a mid-sized Australian company. "
            "You are running a 15-minute phone screen. Open with a brief greeting, then ask about the "
            "candidate's background, motivation for the role, and one or two behavioural questions "
            "(look for the STAR structure: situation, task, action, result). Wrap up by asking if they have questions."
        ),
        coach_brief=(
            "This was a first-round phone screen with a recruiter. Good looks like: a clear, brief "
            "introduction, a believable reason for wanting the role, and behavioural answers that tell a "
            "short story with a clear result. Asking a sensible question at the end is a plus."
        ),
        metric_notes=(
            "Candidate speaking about 55 to 70 percent of the words is healthy. Asking one or two questions "
            "back is a good sign."
        ),
        checks_title="Story shape",
        checks=[
            ("Situation", "described the context or background of an example", "The situation was [what was happening]."),
            ("Task", "said what they were responsible for or trying to achieve", "My job was to [what you had to do]."),
            ("Action", "said what they personally did", "I [what you did]."),
            ("Result", "said what happened as a result", "The result was [what happened]."),
        ],
    ),
    Persona(
        id="manager-dave",
        name="Dave",
        role="Hiring manager",
        description="Direct, time-poor hiring manager who probes for specifics.",
        voice="bm_george",
        speed=1.05,
        system_prompt=(
            BASE_RULES
            + "\n\nYou are Dave, a hiring manager. You are busy and direct. You ask about concrete "
            "projects, decisions the candidate made, and what they would do differently. If an answer "
            "is vague, push for numbers and specifics."
        ),
        coach_brief=(
            "This was a conversation with a direct, time-poor hiring manager. Good looks like: concrete "
            "examples from real work, owning decisions, being straight about trade-offs and mistakes, and "
            "getting to the point without long preamble."
        ),
        metric_notes=(
            "Candidate should carry most of the talking, around 60 to 75 percent. Long answers that take "
            "a while to get to the point matter more here than filler words."
        ),
        checks_title="Answer depth",
        checks=[
            ("Specific example", "named a real project, task or situation rather than speaking in general terms", "One example is [a specific project]."),
            ("Own decision", "explained a choice they made and why", "I decided to [your decision] because [your reason]."),
            ("Outcome", "said what happened, with any figures they actually gave", "The outcome was [what happened]."),
            ("In hindsight", "said what they would do differently or what they learned", "Next time I would [what you would change]."),
        ],
    ),
    Persona(
        id="senior-mel",
        name="Mel",
        role="Senior colleague",
        description="Friendly senior teammate; practise asking for help and making small talk.",
        voice="bf_isabella",
        system_prompt=(
            BASE_RULES
            + "\n\nYou are Mel, a friendly senior colleague who is mid-task when the user approaches. "
            "Be approachable but slightly distracted at first. Let the user lead; if they are unclear "
            "about what they need, ask a clarifying question."
        ),
        speaker_label="Colleague",
        coach_brief=(
            "This was NOT an interview. It was an everyday workplace chat with a friendly senior colleague "
            "who was busy: practice at asking for help, making small talk and being easy to work with. "
            "Good looks like: a clear, short ask, just enough context, interest in the other person, "
            "and a warm close. Do not coach it like an interview and do not mention STAR."
        ),
        metric_notes=(
            "A roughly even split of talking, around 40 to 55 percent, is natural. Asking questions back "
            "is good, because it shows interest in Mel."
        ),
        checks_title="Getting help",
        checks=[
            ("Clear ask", "made it clear what they needed or wanted to talk about", "I am working on [your task] and could use [your specific ask]."),
            ("Enough context", "gave just enough background for the colleague to help", "So far I have [what you have tried]."),
            ("Showed interest", "asked about Mel, or acknowledged what Mel said", "How is [something about their day or work] going?"),
            ("Warm close", "thanked Mel or closed the conversation politely", "Thanks, that really helps."),
        ],
    ),
]


def get_persona(persona_id: str) -> Persona | None:
    return next((p for p in PERSONAS if p.id == persona_id), None)
