/**
 * The cartridge. A pure, deterministic climb at the Game Boy's native
 * 160x144. No rendering and no DOM in here — `step` takes a state and an
 * input and returns the next state, which keeps it testable (a bot can play
 * it headlessly, which is also what drives attract mode) and keeps the
 * renderer dumb.
 */

export const W = 160;
export const H = 144;

const GRAVITY = 900;
const JUMP = 330;
const WEAK_JUMP = 300;
const SPRING_JUMP = 585;
const MOVE = 118;
const AIR_FRICTION = 0.86;
const FIXED_DT = 1 / 60;

export const GOAL = 1500;

export const PLAYER_W = 9;
export const PLAYER_H = 11;

const COMBO_WINDOW = 6;

/* --------------------------------- zones --------------------------------- */

export type Zone = {
  name: string;
  from: number;
  /** Sideways push in px/s². Zero until the canopy opens up. */
  wind: number;
  weak: boolean;
  moving: boolean;
  springs: boolean;
};

export const ZONES: Zone[] = [
  { name: "THE TRUNK", from: 0, wind: 0, weak: false, moving: false, springs: false },
  { name: "THE CANOPY", from: 380, wind: 0, weak: true, moving: false, springs: false },
  { name: "THE CLOUDS", from: 760, wind: 26, weak: true, moving: true, springs: true },
  { name: "ABOVE IT ALL", from: 1140, wind: 44, weak: true, moving: true, springs: true },
];

export function zoneAt(y: number) {
  let i = 0;
  for (let z = 0; z < ZONES.length; z++) if (y >= ZONES[z].from) i = z;
  return i;
}

/* -------------------------------- entities ------------------------------- */

export type BranchKind = "solid" | "weak" | "moving" | "spring";

export type Branch = {
  id: number;
  x: number;
  y: number;
  w: number;
  kind: BranchKind;
  broken: boolean;
  /** Moving branches only. */
  vx: number;
  minX: number;
  maxX: number;
};

export type Leaf = { id: number; x: number; y: number; got: boolean };

export type Phase = "title" | "playing" | "paused" | "dead" | "won";

export type GameEvent = "jump" | "spring" | "break" | "leaf" | "die" | "win" | "zone";

export type GameState = {
  phase: Phase;
  t: number;
  /** Carried remainder so the sim always advances in fixed steps. */
  acc: number;
  seed: number;
  nextId: number;

  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: 1 | -1;

  camY: number;
  branches: Branch[];
  leaves: Leaf[];
  nextBranchY: number;

  zone: number;
  /** Counts down while the zone banner is on screen. */
  zoneBanner: number;
  wind: number;
  windTarget: number;
  windTimer: number;

  height: number;
  score: number;
  best: number;
  leavesGot: number;
  combo: number;
  comboTimer: number;

  /** Decays to zero; the renderer reads it for screen shake. */
  shake: number;
  events: GameEvent[];
};

export type Input = { left: boolean; right: boolean };

/* ------------------------------ seeded rng ------------------------------- */

function rng(state: GameState): number {
  // xorshift32 — reproducible layouts for a given seed.
  let x = state.seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.seed = x | 0;
  return ((x >>> 0) % 100000) / 100000;
}

/* -------------------------------- lifecycle ------------------------------ */

export function newGame(best = 0, seed = Date.now() & 0x7fffffff): GameState {
  const s: GameState = {
    phase: "title",
    t: 0,
    acc: 0,
    seed: seed || 1,
    nextId: 1,
    px: W / 2,
    py: 30,
    vx: 0,
    vy: 0,
    facing: 1,
    camY: 0,
    branches: [],
    leaves: [],
    nextBranchY: 0,
    zone: 0,
    zoneBanner: 0,
    wind: 0,
    windTarget: 0,
    windTimer: 0,
    height: 0,
    score: 0,
    best,
    leavesGot: 0,
    combo: 0,
    comboTimer: 0,
    shake: 0,
    events: [],
  };

  // A wide ground branch so the first hop is always safe.
  s.branches.push({
    id: s.nextId++,
    x: 0,
    y: 18,
    w: W,
    kind: "solid",
    broken: false,
    vx: 0,
    minX: 0,
    maxX: 0,
  });
  s.nextBranchY = 46;
  grow(s);
  return s;
}

export function start(s: GameState): GameState {
  const next = newGame(s.best, s.seed);
  next.phase = "playing";
  next.vy = JUMP;
  return next;
}

/** Extends the tree far enough above the camera to stay off-screen. */
function grow(s: GameState) {
  const ceiling = s.camY + H * 2.2;
  while (s.nextBranchY < ceiling && s.nextBranchY < GOAL + 40) {
    const y = Math.round(s.nextBranchY);
    const zone = ZONES[zoneAt(y)];
    const difficulty = Math.min(1, y / GOAL);

    // Branches stay dense enough that a missed hop still has two or three
    // chances to catch something on the way down.
    const w = Math.round(52 - difficulty * 18 + rng(s) * 10);
    const x = Math.round(rng(s) * (W - w));

    let kind: BranchKind = "solid";
    const roll = rng(s);
    if (zone.springs && roll < 0.13) kind = "spring";
    else if (zone.moving && roll < 0.3) kind = "moving";
    else if (zone.weak && roll < 0.46) kind = "weak";

    const span = kind === "moving" ? 26 + rng(s) * 30 : 0;

    s.branches.push({
      id: s.nextId++,
      x,
      y,
      w,
      kind,
      broken: false,
      vx: kind === "moving" ? (rng(s) < 0.5 ? -1 : 1) * (16 + rng(s) * 22) : 0,
      minX: Math.max(0, x - span),
      maxX: Math.min(W - w, x + span),
    });

    if (rng(s) < 0.16) {
      s.leaves.push({ id: s.nextId++, x: Math.round(x + w / 2), y: y + 22, got: false });
    }

    s.nextBranchY += 18 + rng(s) * (8 + difficulty * 12);
  }
}

/* ---------------------------------- step --------------------------------- */

function tick(s: GameState, input: Input) {
  const dt = FIXED_DT;
  s.t += dt;
  s.shake = Math.max(0, s.shake - dt * 42);
  if (s.zoneBanner > 0) s.zoneBanner -= dt;

  if (s.combo > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) s.combo = 0;
  }

  // wind drifts toward a fresh target every few seconds
  const zone = ZONES[s.zone];
  s.windTimer -= dt;
  if (s.windTimer <= 0) {
    s.windTimer = 2.5 + rng(s) * 2.5;
    s.windTarget =
      zone.wind === 0 ? 0 : (rng(s) < 0.5 ? -1 : 1) * zone.wind * (0.5 + rng(s) * 0.5);
  }
  s.wind += (s.windTarget - s.wind) * Math.min(1, dt * 1.4);

  // horizontal
  if (input.left) {
    s.vx = -MOVE;
    s.facing = -1;
  } else if (input.right) {
    s.vx = MOVE;
    s.facing = 1;
  } else {
    s.vx *= AIR_FRICTION;
  }
  s.vx += s.wind * dt;

  const prevY = s.py;
  s.px += s.vx * dt;
  s.vy -= GRAVITY * dt;
  s.py += s.vy * dt;

  // wrap around the trunk
  if (s.px < -PLAYER_W) s.px = W;
  else if (s.px > W) s.px = -PLAYER_W;

  for (const b of s.branches) {
    if (b.kind !== "moving" || b.broken) continue;
    b.x += b.vx * dt;
    if (b.x <= b.minX) {
      b.x = b.minX;
      b.vx = Math.abs(b.vx);
    } else if (b.x >= b.maxX) {
      b.x = b.maxX;
      b.vx = -Math.abs(b.vx);
    }
  }

  // Land only while falling, and only if the feet crossed the branch this
  // step — otherwise a fast fall tunnels straight through.
  if (s.vy < 0) {
    for (const b of s.branches) {
      if (b.broken) continue;
      if (prevY < b.y || s.py > b.y) continue;
      if (s.px + PLAYER_W < b.x || s.px > b.x + b.w) continue;

      s.py = b.y;
      if (b.kind === "weak") {
        b.broken = true;
        s.vy = WEAK_JUMP;
        s.shake = 3;
        s.events.push("break");
      } else if (b.kind === "spring") {
        s.vy = SPRING_JUMP;
        s.shake = 5;
        s.events.push("spring");
      } else {
        s.vy = JUMP;
        s.events.push("jump");
      }
      break;
    }
  }

  for (const l of s.leaves) {
    if (l.got) continue;
    if (Math.abs(l.x - (s.px + PLAYER_W / 2)) < 7 && Math.abs(l.y - (s.py + PLAYER_H / 2)) < 8) {
      l.got = true;
      s.leavesGot += 1;
      s.combo += 1;
      s.comboTimer = COMBO_WINDOW;
      s.score += 25 * s.combo;
      s.events.push("leaf");
    }
  }

  // Camera only ever rises. The offset has to clear the jump height (~60px)
  // by a wide margin, or missing one branch is instant death.
  const want = s.py - H * 0.72;
  if (want > s.camY) s.camY = want;

  if (s.py > s.height) {
    s.score += Math.round(s.py - s.height);
    s.height = Math.round(s.py);
  }

  // Zones only ever advance. Bouncing across a boundary would otherwise
  // re-fire the banner and the sting over and over.
  const zi = zoneAt(s.py);
  if (zi > s.zone) {
    s.zone = zi;
    s.zoneBanner = 2.2;
    s.events.push("zone");
  }

  grow(s);

  if (s.branches.length > 110) {
    s.branches = s.branches.filter((b) => b.y > s.camY - 40);
    s.leaves = s.leaves.filter((l) => l.y > s.camY - 40);
  }

  if (s.py >= GOAL) {
    s.phase = "won";
    s.best = Math.max(s.best, s.score);
    s.shake = 8;
    s.events.push("win");
    return;
  }
  if (s.py < s.camY - PLAYER_H) {
    s.phase = "dead";
    s.best = Math.max(s.best, s.score);
    s.events.push("die");
  }
}

/** Advances by real elapsed time in fixed increments. Mutates and returns `s`. */
export function step(s: GameState, input: Input, elapsed: number): GameState {
  if (s.phase !== "playing") {
    s.t += elapsed;
    return s;
  }
  // Cap the catch-up so a backgrounded tab doesn't simulate a huge burst.
  s.acc = Math.min(s.acc + elapsed, 0.25);
  while (s.acc >= FIXED_DT) {
    s.acc -= FIXED_DT;
    tick(s, input);
    if (s.phase !== "playing") break;
  }
  return s;
}

export const progress = (s: GameState) => Math.min(1, Math.max(0, s.py / GOAL));
