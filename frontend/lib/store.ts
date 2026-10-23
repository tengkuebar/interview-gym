import { create } from "zustand";
import type { Difficulty, Message, Report } from "./api";

type State = {
  personaId: string;
  difficulty: Difficulty;
  jobAd: string;
  speakReplies: boolean;
  volume: number; // 0 to 1, applied to spoken replies
  messages: Message[];
  report: Report | null;
  setVolume: (v: number) => void;
  setReport: (r: Report | null) => void;
  setPersona: (id: string) => void;
  setDifficulty: (d: Difficulty) => void;
  setJobAd: (t: string) => void;
  setSpeakReplies: (v: boolean) => void;
  addMessage: (m: Message) => void;
  appendToLast: (chunk: string) => void;
  rewindOneTurn: () => void;
  resetSession: () => void;
};

export const useSession = create<State>((set) => ({
  personaId: "recruiter-priya",
  difficulty: "realistic",
  jobAd: "",
  speakReplies: false,
  volume: 0.8,
  setVolume: (v) => {
    const volume = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem("ig-volume", String(volume));
    } catch {}
    set({ volume });
  },
  messages: [],
  report: null,
  setReport: (report) => set({ report }),
  setPersona: (personaId) => set({ personaId }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setJobAd: (jobAd) => set({ jobAd }),
  setSpeakReplies: (speakReplies) => set({ speakReplies }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  appendToLast: (chunk) =>
    set((s) => {
      const messages = s.messages.slice();
      const last = messages[messages.length - 1];
      if (last) messages[messages.length - 1] = { ...last, content: last.content + chunk };
      return { messages };
    }),
  // Drops the last user answer and everything after it.
  rewindOneTurn: () =>
    set((s) => {
      const idx = s.messages.map((m) => m.role).lastIndexOf("user");
      return idx === -1 ? s : { messages: s.messages.slice(0, idx) };
    }),
  resetSession: () => set({ messages: [], report: null }),
}));
