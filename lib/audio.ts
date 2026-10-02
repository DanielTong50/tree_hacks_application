/**
 * A tiny square-wave sound chip. Everything is synthesised — no audio files,
 * nothing to download. The context is created lazily on the first gesture,
 * because browsers refuse to start audio before one.
 */

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = true;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
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
  if (!next) ensure();
}

export const isMuted = () => muted;

type ToneOpts = {
  freq: number;
  dur: number;
  type?: Wave;
  /** Slide to this frequency over the note's life. */
  to?: number;
  gain?: number;
  delay?: number;
};

function tone({ freq, dur, type = "square", to, gain = 1, delay = 0 }: ToneOpts) {
  if (muted) return;
  const c = ensure();
  if (!c || !master) return;

  const t0 = c.currentTime + delay;
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
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.5, delay = 0) {
  if (muted) return;
  const c = ensure();
  if (!c || !master) return;

  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = c.createBufferSource();
  const env = c.createGain();
  src.buffer = buffer;
  env.gain.value = gain;
  src.connect(env);
  env.connect(master);
  src.start(c.currentTime + delay);
}

/* ------------------------------- the sounds ------------------------------ */

export const sfx = {
  jump: () => tone({ freq: 420, to: 760, dur: 0.1, gain: 0.5 }),
  breaking: () => {
    tone({ freq: 240, to: 90, dur: 0.16, type: "sawtooth", gain: 0.45 });
    noise(0.12, 0.3);
  },
  leaf: () => {
    tone({ freq: 880, dur: 0.07, gain: 0.4 });
    tone({ freq: 1320, dur: 0.1, gain: 0.35, delay: 0.07 });
  },
  die: () => {
    tone({ freq: 400, to: 60, dur: 0.6, type: "triangle", gain: 0.5 });
    noise(0.25, 0.2, 0.05);
  },
  select: () => tone({ freq: 660, dur: 0.06, gain: 0.4 }),

  boot: () => {
    // The little chime on power-up.
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
