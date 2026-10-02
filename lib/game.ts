/**
 * The cartridge. A pure, deterministic climb-the-tree game at the Game Boy's
 * native 160x144. No rendering and no DOM in here — `step` takes a state and
 * an input and returns the next state, which keeps it testable and keeps the
 * renderer dumb.
 */

export const W = 160;
export const H = 144;

const GRAVITY = 900;
const JUMP = 330;
const WEAK_JUMP = 300;
const MOVE = 118;
const AIR_FRICTION = 0.86;
const FIXED_DT = 1 / 60;

export const GOAL = 1000;

export const PLAYER_W = 9;
export const PLAYER_H = 11;

export type Branch = {
  id: number;
  x: number;
  y: number;
  w: number;
  /** Weak branches snap after one bounce. */
  weak: boolean;
  broken: boolean;
};

export type Leaf = { id: number; x: number; y: number; got: boolean };

export type Phase = "title" | "playing" | "dead" | "won";

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

  height: number;
  best: number;
  leavesGot: number;
  /** One-shot flags the renderer and audio drain each frame. */
  events: ("jump" | "break" | "leaf" | "die" | "win")[];
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
    height: 0,
    best,
    leavesGot: 0,
    events: [],
  };

  // A wide ground branch so the first hop is always safe.
  s.branches.push({ id: s.nextId++, x: 0, y: 18, w: W, weak: false, broken: false });
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
    const difficulty = Math.min(1, s.nextBranchY / GOAL);
    // Branches must be dense enough that a missed hop still has two or three
    // chances to catch something on the way down — a 60px jump over 28px gaps
    // means you sail past the next branch, not onto it.
    const w = Math.round(52 - difficulty * 20 + rng(s) * 10);
    const x = Math.round(rng(s) * (W - w));
    const weak = s.nextBranchY > 400 && rng(s) < 0.1 + difficulty * 0.14;

    s.branches.push({ id: s.nextId++, x, y: Math.round(s.nextBranchY), w, weak, broken: false });

    if (rng(s) < 0.14) {
      s.leaves.push({
        id: s.nextId++,
        x: Math.round(x + w / 2),
        y: Math.round(s.nextBranchY + 22),
        got: false,
      });
    }

    s.nextBranchY += 18 + rng(s) * (8 + difficulty * 10);
  }
}

/* ---------------------------------- step --------------------------------- */

function tick(s: GameState, input: Input) {
  const dt = FIXED_DT;
  s.t += dt;

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

  const prevY = s.py;
  s.px += s.vx * dt;
  s.vy -= GRAVITY * dt;
  s.py += s.vy * dt;

  // wrap around the trunk
  if (s.px < -PLAYER_W) s.px = W;
  else if (s.px > W) s.px = -PLAYER_W;

  // Land only while falling, and only if the feet crossed the branch this
  // step — otherwise a fast fall tunnels straight through.
  if (s.vy < 0) {
    for (const b of s.branches) {
      if (b.broken) continue;
      if (prevY < b.y || s.py > b.y) continue;
      const left = s.px + PLAYER_W;
      const right = s.px;
      if (left < b.x || right > b.x + b.w) continue;

      s.py = b.y;
      if (b.weak) {
        b.broken = true;
        s.vy = WEAK_JUMP;
        s.events.push("break");
      } else {
        s.vy = JUMP;
        s.events.push("jump");
      }
      break;
    }
  }

  // leaves
  for (const l of s.leaves) {
    if (l.got) continue;
    if (Math.abs(l.x - (s.px + PLAYER_W / 2)) < 7 && Math.abs(l.y - (s.py + PLAYER_H / 2)) < 8) {
      l.got = true;
      s.leavesGot += 1;
      s.events.push("leaf");
    }
  }

  // Camera only ever rises. The offset has to exceed the jump height
  // (~60px) by a healthy margin, or missing one branch is instant death.
  const want = s.py - H * 0.72;
  if (want > s.camY) s.camY = want;

  s.height = Math.max(s.height, Math.round(s.py));
  grow(s);

  // cull what has scrolled away for good
  if (s.branches.length > 90) {
    s.branches = s.branches.filter((b) => b.y > s.camY - 40);
    s.leaves = s.leaves.filter((l) => l.y > s.camY - 40);
  }

  if (s.py >= GOAL) {
    s.phase = "won";
    s.best = Math.max(s.best, s.height);
    s.events.push("win");
    return;
  }
  if (s.py < s.camY - PLAYER_H) {
    s.phase = "dead";
    s.best = Math.max(s.best, s.height);
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
