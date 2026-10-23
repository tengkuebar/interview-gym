import { speak } from "@/lib/api";

type Options = {
  voice: () => { voice: string; speed: number };
  volume: () => number;
  onActive: (active: boolean) => void;
  onError: () => void;
  onPlayStart?: () => void; // audio is actually audible now (after the voice was generated)
};

// Plays text one chunk at a time. Chunks are synthesised one after another (the
// TTS runs on CPU, so parallel requests would only slow each other down) while
// earlier chunks are already playing. stop() drops everything still queued.
export class SpeechQueue {
  private gen = 0;
  private pending = 0;
  private fetchChain: Promise<void> = Promise.resolve();
  private playChain: Promise<void> = Promise.resolve();
  private audio: HTMLAudioElement | null = null;
  private release: (() => void) | null = null;

  private opts: Options = {
    voice: () => ({ voice: "bf_emma", speed: 1 }),
    volume: () => 1,
    onActive: () => {},
    onError: () => {},
  };

  configure(opts: Options) {
    this.opts = opts;
  }

  /** True while anything is queued or playing. */
  get active() {
    return this.pending > 0;
  }

  enqueue(text: string) {
    const gen = this.gen;
    const { voice, speed } = this.opts.voice();
    this.pending++;
    this.opts.onActive(true);

    const blob = this.fetchChain.then(() => (gen === this.gen ? speak(text, voice, speed) : null));
    this.fetchChain = blob.then(
      () => {},
      () => {},
    );
    this.playChain = this.playChain.then(async () => {
      try {
        const b = await blob;
        if (b && gen === this.gen) await this.play(b);
      } catch {
        if (gen === this.gen) this.opts.onError();
      } finally {
        if (gen === this.gen && --this.pending === 0) this.opts.onActive(false);
      }
    });
  }

  stop() {
    this.gen++;
    this.pending = 0;
    this.audio?.pause();
    this.release?.();
    this.opts.onActive(false);
  }

  setVolume(v: number) {
    if (this.audio) this.audio.volume = v;
  }

  private play(blob: Blob) {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = this.opts.volume();
      this.audio = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        this.release = null;
        resolve();
      };
      this.release = done;
      audio.onplaying = () => this.opts.onPlayStart?.();
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch((e) => {
        done();
        reject(e);
      });
    });
  }
}

// Splits off the first sentence that is complete (ends in . ! or ? followed by
// whitespace) and at least `min` characters long, so tiny fragments like "Right."
// are spoken together with the next sentence instead of on their own.
export function takeSentence(buf: string, min = 15): [string, string] | null {
  const re = /[.!?]["')\]]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buf))) {
    const end = m.index + m[0].length;
    if (end >= min) return [buf.slice(0, end).trim(), buf.slice(end)];
  }
  return null;
}
