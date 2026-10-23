const TICK_MS = 50;
const QUIET_SHOW_MS = 800; // show the countdown only after this much quiet, so short gaps between words don't flicker
const MAX_TURN_MS = 180_000;

type Events = {
  onLevel: (level: number, rms: number) => void; // level is 0..1 for drawing; rms is the raw volume
  onQuiet: (quiet: boolean) => void; // you stopped talking (after having talked) / started again
  onEnd: (audio: Blob | null) => void; // turn over; null when nothing was said
};

// Keeps the microphone open for the whole voice session and records one turn at a time.
// A turn ends after `pauseMs` of quiet following speech, or when endNow() is called.
export class VoiceListener {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples = new Uint8Array(1024);
  private timer: ReturnType<typeof setInterval> | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private floor: number[] = [];
  private quiet = false;
  private floorHint = 0;
  private turn = { active: false, spoken: false, loudFrames: 0, lastSpeech: 0, began: 0 };

  private ev: Events = { onLevel: () => {}, onQuiet: () => {}, onEnd: () => {} };

  constructor(private pauseMs = 4000) {}

  configure(ev: Events) {
    this.ev = ev;
  }

  /** Speech has to clear at least this level (the room's background level found in voice setup). */
  setFloorHint(floor: number) {
    this.floorHint = floor;
  }

  async open(deviceId?: string) {
    if (this.stream) return;
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
      });
    } catch (e) {
      if (!deviceId || (e as Error).name === "NotAllowedError") throw e;
      // The saved microphone isn't plugged in any more: use the default one.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: base });
    }
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  startTurn() {
    if (!this.stream) return;
    this.cancelTurn();
    this.chunks = [];
    this.quiet = false;
    this.turn = { active: true, spoken: false, loudFrames: 0, lastSpeech: 0, began: Date.now() };
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }

  /** Finish the turn now (the person tapped "send now"). */
  endNow() {
    this.finish();
  }

  /** Drop the current turn without sending anything. */
  cancelTurn() {
    this.turn.active = false;
    if (this.rec && this.rec.state !== "inactive") {
      this.rec.onstop = null;
      this.rec.stop();
    }
    this.rec = null;
  }

  close() {
    this.cancelTurn();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private finish() {
    if (!this.turn.active) return;
    const spoken = this.turn.spoken;
    this.turn.active = false;
    const rec = this.rec;
    this.rec = null;
    if (!rec || rec.state === "inactive") {
      this.ev.onEnd(null);
      return;
    }
    rec.onstop = () => {
      const blob = spoken && this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType }) : null;
      this.ev.onEnd(blob);
    };
    rec.stop();
  }

  private tick() {
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / this.samples.length);
    this.ev.onLevel(Math.min(1, rms * 5), rms);

    // Background level = the quietest moment of the last 3 seconds; speech must clear 3x that.
    this.floor.push(rms);
    if (this.floor.length > 60) this.floor.shift();
    const threshold = Math.max(0.02, this.floorHint * 3, Math.min(...this.floor) * 3);

    const t = this.turn;
    if (!t.active) return;
    const now = Date.now();

    if (rms > threshold) {
      t.loudFrames++;
      if (t.loudFrames >= 3) {
        // about 150 ms of sound in a row, so a click or a cough doesn't count as speech
        t.spoken = true;
        t.lastSpeech = now;
      }
    } else {
      t.loudFrames = 0;
    }

    if (t.spoken) {
      const quietFor = now - t.lastSpeech;
      const isQuiet = quietFor >= QUIET_SHOW_MS;
      if (isQuiet !== this.quiet) {
        this.quiet = isQuiet;
        this.ev.onQuiet(isQuiet);
      }
      if (quietFor >= this.pauseMs) this.finish();
    }
    if (now - t.began > MAX_TURN_MS) this.finish();
  }
}
