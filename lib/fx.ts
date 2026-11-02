/**
 * Cosmetic particles. Deliberately kept out of GameState so the simulation
 * stays pure and deterministic — these are spawned from events and live only
 * as long as they look good.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  shade: number;
};

const pool: Particle[] = [];
const MAX = 90;

function add(p: Particle) {
  if (pool.length >= MAX) pool.shift();
  pool.push(p);
}

/** Puff of bark dust where the feet landed. */
export function dust(x: number, y: number, n = 5) {
  for (let i = 0; i < n; i++) {
    add({
      x,
      y,
      vx: (Math.random() - 0.5) * 70,
      vy: Math.random() * 26,
      life: 1,
      max: 0.28 + Math.random() * 0.2,
      size: 1,
      shade: 1,
    });
  }
}

/** Splinters flying off a branch that just snapped. */
export function splinter(x: number, y: number, w: number) {
  for (let i = 0; i < 9; i++) {
    add({
      x: x + Math.random() * w,
      y,
      vx: (Math.random() - 0.5) * 110,
      vy: -30 - Math.random() * 60,
      life: 1,
      max: 0.5 + Math.random() * 0.3,
      size: Math.random() < 0.4 ? 2 : 1,
      shade: 0,
    });
  }
}

/** Sparkle burst when a leaf is collected. */
export function sparkle(x: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    add({
      x,
      y,
      vx: Math.cos(a) * 52,
      vy: Math.sin(a) * 52 + 18,
      life: 1,
      max: 0.4,
      size: 1,
      shade: 1,
    });
  }
}

/** Ring of air off a spring. */
export function boost(x: number, y: number) {
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    add({
      x,
      y,
      vx: Math.cos(a) * 80,
      vy: Math.sin(a) * 40,
      life: 1,
      max: 0.35,
      size: 1,
      shade: 0,
    });
  }
}

export function update(dt: number) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    p.life -= dt / p.max;
    if (p.life <= 0) {
      pool.splice(i, 1);
      continue;
    }
    p.vy -= 240 * dt; // world y is up, so gravity pulls down
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function draw(
  g: CanvasRenderingContext2D,
  toScreenY: (y: number) => number,
  shades: readonly string[],
) {
  for (const p of pool) {
    g.fillStyle = shades[p.shade];
    g.fillRect(Math.round(p.x), Math.round(toScreenY(p.y)), p.size, p.size);
  }
}

export function clear() {
  pool.length = 0;
}
