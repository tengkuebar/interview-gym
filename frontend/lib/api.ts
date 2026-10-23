// Packaged app (NEXT_PUBLIC_STATIC=1): the backend serves this page, so call the same origin.
export const API = process.env.NEXT_PUBLIC_STATIC
  ? ""
  : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001");

export type Persona = {
  id: string;
  name: string;
  role: string;
  description: string;
  voice: string;
  speed: number;
};

export type Message = { role: "user" | "assistant"; content: string };
export type Difficulty = "gentle" | "realistic" | "tough";

// Mirrors backend/app/personas.py so the UI still renders if the API is down.
export const FALLBACK_PERSONAS: Persona[] = [
  {
    id: "recruiter-priya",
    name: "Priya",
    role: "Recruiter",
    description: "Warm but efficient. Runs a first-round phone screen.",
    voice: "bf_emma",
    speed: 1,
  },
  {
    id: "manager-dave",
    name: "Dave",
    role: "Hiring manager",
    description: "Direct and time-poor. Pushes for specifics and numbers.",
    voice: "bm_george",
    speed: 1.05,
  },
  {
    id: "senior-mel",
    name: "Mel",
    role: "Senior colleague",
    description: "Friendly but mid-task. Good for asking for help and small talk.",
    voice: "bf_isabella",
    speed: 1,
  },
];

export async function getPersonas(): Promise<Persona[]> {
  const res = await fetch(`${API}/api/personas`);
  if (!res.ok) throw new Error("Could not load personas");
  return res.json();
}

export async function* streamChat(
  body: {
    persona_id: string;
    messages: Message[];
    difficulty: Difficulty;
    context?: string;
  },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Chat request failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export type QuoteItem = { point: string; quote: string };

export type SessionSummary = {
  id: string;
  created_at: string;
  persona_name: string;
  persona_role: string;
  difficulty: Difficulty;
  headline: string;
  answers: number;
};

export type SessionDetail = {
  id: string;
  created_at: string;
  persona_name: string;
  persona_role: string;
  difficulty: Difficulty;
  messages: Message[];
  report: Report | null;
};

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API}/api/sessions`);
  if (!res.ok) throw new Error("Couldn't load your history");
  return res.json();
}

export async function getSession(id: string): Promise<SessionDetail> {
  const res = await fetch(`${API}/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new Error("That session isn't here any more.");
  if (!res.ok) throw new Error("Couldn't load that session");
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API}/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error("Couldn't delete that session");
}

export async function deleteAllSessions(): Promise<void> {
  const res = await fetch(`${API}/api/sessions`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't delete your history");
}

export type Report = {
  session_id?: string | null;
  persona_id: string;
  persona_name: string;
  persona_role: string;
  difficulty: Difficulty;
  headline: string;
  summary: string;
  strengths: QuoteItem[];
  focus_area: { point: string; quote: string; try_next: string };
  checks?: { name: string; met: boolean }[];
  checks_title?: string;
  // Only on reports saved before per-role checks existed.
  star?: { situation: boolean; task: boolean; action: boolean; result: boolean } | null;
  fill_in?: string;
  // Only on reports saved before fill-in templates existed.
  rewrite?: { original: string; improved: string } | null;
  metrics: {
    filler_words: number;
    hedges: number;
    questions_asked_back: number;
    talk_ratio_user: number;
  };
};

export async function getReport(body: {
  persona_id: string;
  messages: Message[];
  difficulty: Difficulty;
  context?: string;
}): Promise<Report> {
  const res = await fetch(`${API}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "The coach couldn't put a report together.";
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export type AssistKind = "hint" | "reply";

export async function getAssist(
  kind: AssistKind,
  body: { persona_id: string; messages: Message[]; difficulty: Difficulty; context?: string },
): Promise<string> {
  const res = await fetch(`${API}/api/assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, kind }),
  });
  if (!res.ok) {
    let detail = "Couldn't come up with that just now. Try again.";
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return (await res.json()).text as string;
}

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "answer.webm");
  const res = await fetch(`${API}/api/stt`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "Couldn't turn that into text. Try again, or type it.";
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return ((await res.json()).text as string) ?? "";
}

export type VoiceProfile = {
  calibrated_at: string | null;
  mic: { label?: string; noise_floor?: number };
  stt_model: string | null;
  vocabulary: string[];
  corrections: Record<string, string>;
  results: { model: string; accuracy: number; seconds_per_clip: number }[];
};

export type SttModel = {
  name: string;
  label: string;
  size: string;
  default: boolean; // the model everyone gets unless they choose another
  active: boolean; // the one transcriptions use right now
  installed: boolean;
  downloading: boolean;
  error: string;
};

export async function getProfile(): Promise<VoiceProfile> {
  const res = await fetch(`${API}/api/profile`);
  if (!res.ok) throw new Error("Couldn't load your voice profile");
  return res.json();
}

export async function saveProfile(patch: Partial<VoiceProfile>): Promise<VoiceProfile> {
  const res = await fetch(`${API}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Couldn't save your voice profile");
  return res.json();
}

export async function deleteProfile(): Promise<void> {
  const res = await fetch(`${API}/api/profile`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't delete your voice profile");
}

export async function getSttModels(): Promise<SttModel[]> {
  const res = await fetch(`${API}/api/stt/models`);
  if (!res.ok) throw new Error("Couldn't check the voice models");
  return res.json();
}

export async function downloadSttModel(name: string): Promise<void> {
  const res = await fetch(`${API}/api/stt/models/${encodeURIComponent(name)}/download`, { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start that download");
}

// For voice setup: one recording through one named model, without the person's own
// vocabulary and corrections, so models can be compared fairly.
export async function testTranscribe(audio: Blob, model: string): Promise<{ text: string; seconds: number }> {
  const form = new FormData();
  form.append("model", model);
  form.append("plain", "true");
  form.append("file", audio, "clip.webm");
  const res = await fetch(`${API}/api/stt`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "That test recording couldn't be read.";
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export async function speak(text: string, voice: string, speed: number): Promise<Blob> {
  const res = await fetch(`${API}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
  });
  if (!res.ok) throw new Error("Voice is not available yet");
  return res.blob();
}
