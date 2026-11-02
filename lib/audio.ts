/**
 * A tiny square-wave sound chip plus a four-track sequencer. Everything is
 * synthesised — no audio files, nothing to download.
 *
 * The context is created lazily on the first gesture, because browsers refuse
 * to start audio before one.
 */

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = true;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55; // sits under the effects
      musicBus.connect(master);
    } catch {
      return null; // audio is a nicety; never let it break the game
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a real user gesture before the first sound. */
export function unlock() {
  ensure();
}

export function setMuted(next: boolean) {
  muted = next;
  if (next) stopMusic();
  else ensure();
}

export const isMuted = () => muted;

/* ------------------------------- primitives ------------------------------ */

type ToneOpts = {
  freq: number;
  dur: number;
  type?: Wave;
  to?: number;
  gain?: number;
  delay?: number;
  at?: number;
  bus?: GainNode | null;
};

function tone({ freq, dur, type = "square", to, gain = 1, delay = 0, at, bus }: ToneOpts) {
  if (muted) return;
  const c = ensure();
  if (!c || !master) return;

  const t0 = at ?? c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);

  // Tiny attack avoids the click a hard start makes on square waves.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env);
  env.connect(bus ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.5, delay = 0, at?: number, bus?: GainNode | null) {
  if (muted) return;
  const c = ensure();
  if (!c || !master) return;

  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

  const src = c.createBufferSource();
  const env = c.createGain();
  src.buffer = buffer;
  env.gain.value = gain;
  src.connect(env);
  env.connect(bus ?? master);
  src.start(at ?? c.currentTime + delay);
}

/* ------------------------------- the sounds ------------------------------ */

export const sfx = {
  jump: () => tone({ freq: 420, to: 760, dur: 0.1, gain: 0.5 }),
  spring: () => {
    tone({ freq: 300, to: 1200, dur: 0.22, gain: 0.55 });
    tone({ freq: 600, to: 1800, dur: 0.18, type: "triangle", gain: 0.3, delay: 0.03 });
  },
  breaking: () => {
    tone({ freq: 240, to: 90, dur: 0.16, type: "sawtooth", gain: 0.45 });
    noise(0.12, 0.3);
  },
  leaf: () => {
    tone({ freq: 880, dur: 0.07, gain: 0.4 });
    tone({ freq: 1320, dur: 0.1, gain: 0.35, delay: 0.07 });
  },
  combo: (n: number) => {
    const f = 740 * Math.pow(1.12, Math.min(n, 10));
    tone({ freq: f, dur: 0.09, gain: 0.4 });
  },
  zone: () => {
    // Quiet enough to register without pulling focus off the next branch.
    [523.25, 659.25].forEach((f, i) =>
      tone({ freq: f, dur: 0.12, gain: 0.16, delay: i * 0.08 }),
    );
  },
  die: () => {
    tone({ freq: 400, to: 60, dur: 0.6, type: "triangle", gain: 0.5 });
    noise(0.25, 0.2, 0.05);
  },
  select: () => tone({ freq: 660, dur: 0.06, gain: 0.4 }),
  pause: () => tone({ freq: 520, to: 300, dur: 0.1, gain: 0.35 }),

  boot: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, dur: i === 3 ? 0.4 : 0.1, gain: 0.4, delay: i * 0.085 }),
    );
  },

  win: () => {
    const melody: [number, number][] = [
      [523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36],
      [987.77, 0.52], [1046.5, 0.62],
    ];
    melody.forEach(([f, d], i) =>
      tone({ freq: f, dur: i === melody.length - 1 ? 0.55 : 0.13, gain: 0.42, delay: d }),
    );
    melody.forEach(([f, d]) =>
      tone({ freq: f / 2, dur: 0.12, type: "triangle", gain: 0.22, delay: d }),
    );
  },
};

/* ------------------------------- sequencer ------------------------------- */

const BPM = 132;
const STEP = 60 / BPM / 4; // sixteenth note
const LOOKAHEAD = 0.14;
const ROOT = 220; // A3

const semi = (n: number) => ROOT * Math.pow(2, n / 12);

/** `-1` is a rest. Values are semitones from the root. */
type Track = { lead: number[]; bass: number[]; hat: number[] };

// One per zone: the climb gets busier and higher as it goes up.
const TRACKS: Track[] = [
  {
    lead: [12, -1, 15, -1, 19, -1, 15, -1, 12, -1, 17, -1, 15, -1, -1, -1,
           10, -1, 14, -1, 17, -1, 14, -1, 10, -1, 12, -1, 10, -1, -1, -1],
    bass: [0, -1, -1, 0, -1, -1, 0, -1, -3, -1, -1, -3, -1, -1, -3, -1,
           -5, -1, -1, -5, -1, -1, -5, -1, -3, -1, -1, -3, -1, -1, -1, -1],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
          1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    lead: [19, 22, -1, 19, 17, -1, 15, -1, 19, -1, 22, -1, 24, -1, 22, -1,
           17, 19, -1, 17, 15, -1, 12, -1, 15, -1, 17, -1, 19, -1, -1, -1],
    bass: [0, -1, 0, -1, -3, -1, -3, -1, -5, -1, -5, -1, -3, -1, -3, -1,
           0, -1, 0, -1, -3, -1, -3, -1, -7, -1, -7, -1, -5, -1, -5, -1],
    hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0,
          1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
  },
  {
    lead: [24, -1, 22, 19, -1, 22, 24, -1, 26, -1, 24, 22, -1, 19, -1, -1,
           22, -1, 19, 17, -1, 19, 22, -1, 24, -1, 22, 19, -1, 17, -1, -1],
    bass: [-5, -5, -1, -5, -1, -5, -1, -5, -3, -3, -1, -3, -1, -3, -1, -3,
           -7, -7, -1, -7, -1, -7, -1, -7, -5, -5, -1, -5, -1, -5, -1, -5],
    hat: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1,
          1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  },
  {
    lead: [31, -1, 29, -1, 26, -1, 29, 31, 33, -1, 31, -1, 29, -1, 26, -1,
           24, -1, 26, -1, 29, -1, 31, -1, 29, 26, 24, -1, 22, -1, -1, -1],
    bass: [0, 0, -1, 0, 0, -1, 0, -1, -3, -3, -1, -3, -3, -1, -3, -1,
           -5, -5, -1, -5, -5, -1, -5, -1, -7, -7, -1, -7, -7, -1, -7, -1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
          1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
];

let pump: ReturnType<typeof setInterval> | null = null;
let nextStepAt = 0;
let stepIndex = 0;
let trackIndex = 0;

function emitStep(at: number) {
  const track = TRACKS[Math.min(trackIndex, TRACKS.length - 1)];
  const i = stepIndex % track.lead.length;

  const lead = track.lead[i];
  if (lead >= 0) {
    tone({ freq: semi(lead), dur: STEP * 1.7, gain: 0.22, at, bus: musicBus });
  }
  // Bass notes are often below the root (-3, -5, -7), so only -1 is a rest.
  const bass = track.bass[i];
  if (bass !== -1) {
    tone({
      freq: semi(bass - 12),
      dur: STEP * 2.1,
      type: "triangle",
      gain: 0.34,
      at,
      bus: musicBus,
    });
  }
  if (track.hat[i]) noise(0.025, 0.05, 0, at, musicBus);
}

function tickScheduler() {
  const c = ensure();
  if (!c) return;
  while (nextStepAt < c.currentTime + LOOKAHEAD) {
    if (nextStepAt < c.currentTime) nextStepAt = c.currentTime + 0.02;
    emitStep(nextStepAt);
    nextStepAt += STEP;
    stepIndex += 1;
  }
}

export function startMusic(zone = 0) {
  if (muted || pump) return;
  const c = ensure();
  if (!c) return;
  trackIndex = zone;
  stepIndex = 0;
  nextStepAt = c.currentTime + 0.08;
  pump = setInterval(tickScheduler, 25);
}

export function stopMusic() {
  if (pump) {
    clearInterval(pump);
    pump = null;
  }
}

export const musicRunning = () => pump !== null;

/** Swaps the pattern at the next loop boundary rather than mid-bar. */
export function setMusicZone(zone: number) {
  trackIndex = Math.max(0, Math.min(TRACKS.length - 1, zone));
}

/** Quietens the music without stopping it — used while paused. */
export function duckMusic(on: boolean) {
  const c = ensure();
  if (!c || !musicBus) return;
  musicBus.gain.setTargetAtTime(on ? 0.12 : 0.55, c.currentTime, 0.05);
}
