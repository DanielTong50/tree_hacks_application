/**
 * Everything that paints the 160x144 LCD. Drawn into an offscreen buffer at
 * native resolution and blitted up with smoothing off, so every pixel stays
 * square no matter how large the console is on screen.
 *
 * Only four colours are ever available. Which of the four plays background,
 * ink, and detail changes by zone — that is how the climb goes from a bright
 * trunk to a dark sky without ever leaving the palette.
 */

import * as fx from "./fx";
import { GOAL, H, PLAYER_H, PLAYER_W, W, ZONES, zoneAt, type GameState } from "./game";
import { SITE } from "./site";

export type Palette = { id: string; name: string; colors: readonly string[] };

export const PALETTES: Palette[] = [
  { id: "dmg", name: "DMG", colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
  { id: "pocket", name: "POCKET", colors: ["#181818", "#4a4a48", "#9a9a92", "#c9c9bd"] },
  { id: "berry", name: "BERRY", colors: ["#2b0f2e", "#6d2060", "#c2558b", "#f5c2d8"] },
  { id: "cardinal", name: "CARDINAL", colors: ["#2a0908", "#7a1216", "#c9443c", "#f3d3b5"] },
];

export const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

/**
 * One ink scheme for every zone. An earlier version swapped background and
 * ink per zone, which made crossing a boundary flip the whole screen
 * mid-jump — dramatic, but it pulled your eye away from the branch you were
 * aiming at. Zones now read through their scenery instead.
 */
type Ink = { bg: number; ink: number; mid: number; soft: number };

const INK: Ink = { bg: 3, ink: 0, mid: 1, soft: 2 };
const ZONE_INK: Ink[] = [INK, INK, INK, INK];

/* -------------------------------- sprites -------------------------------- */

const IDLE = [
  "..1111...",
  ".122221..",
  ".123321..",
  ".122221..",
  "..1221...",
  ".1122211.",
  "112222211",
  "1.22222.1",
  "..22222..",
  "..1...1..",
  ".11...11.",
];

const RISING = [
  "1.1111.1.",
  "1122221.1",
  ".123321..",
  ".122221..",
  "..1221...",
  "..12221..",
  "..22222..",
  "..22222..",
  "...222...",
  "..1...1..",
  "..11.11..",
];

const FALLING = [
  "..1111...",
  ".122221..",
  ".123321..",
  ".122221..",
  "..1221...",
  "111222111",
  "1.12221.1",
  "..22222..",
  "..22222..",
  ".1.....1.",
  "11.....11",
];

function blit(
  g: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  flip: boolean,
  shades: readonly string[],
) {
  const px = Math.round(x);
  const py = Math.round(y);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const shade = shades[Number(ch) - 1];
      if (!shade) continue;
      g.fillStyle = shade;
      g.fillRect(px + (flip ? row.length - 1 - c : c), py + r, 1, 1);
    }
  }
}

/* --------------------------------- text ---------------------------------- */

export function text(
  g: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
) {
  g.font = `${size}px ${PIXEL_FONT}`;
  g.textAlign = align;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.textAlign = "left";
}

/* ------------------------------ backgrounds ------------------------------ */

/** JS `%` keeps the sign of the dividend, which makes scenery disappear. */
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Deterministic hash so scenery never flickers between frames. */
const h2 = (a: number, b: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function bark(g: CanvasRenderingContext2D, cam: number, p: readonly string[], ink: Ink) {
  g.fillStyle = p[ink.soft];
  const drift = Math.floor(cam * 0.35) % 26;
  for (let i = -1; i < H / 26 + 2; i++) {
    const y = i * 26 + drift;
    g.fillRect(0, y, 4, 14);
    g.fillRect(W - 4, y + 13, 4, 14);
    g.fillRect(2, y + 18, 2, 5);
  }
}

function canopy(g: CanvasRenderingContext2D, cam: number, p: readonly string[], ink: Ink) {
  bark(g, cam, p, ink);
  g.fillStyle = p[ink.soft];
  const band = Math.floor(cam / 34);
  for (let i = -1; i < 6; i++) {
    const n = band + i;
    const x = Math.floor(h2(n, 3) * (W - 34));
    const y = n * 34 - cam * 0.55;
    const sy = H - mod(y, H + 80) + 40;
    if (sy < -30 || sy > H + 30) continue;
    // a loose leaf cluster
    g.fillRect(x + 6, sy, 20, 5);
    g.fillRect(x, sy + 4, 32, 5);
    g.fillRect(x + 4, sy + 8, 24, 4);
  }
}

function clouds(g: CanvasRenderingContext2D, cam: number, p: readonly string[], ink: Ink) {
  // Same weight as the canopy foliage: background texture that marks the
  // zone without competing with the branches you are aiming at.
  g.fillStyle = p[ink.soft];
  const band = Math.floor(cam / 46);
  for (let i = -2; i < 6; i++) {
    const n = band + i;
    const w = 34 + Math.floor(h2(n, 7) * 40);
    const x = Math.floor(h2(n, 11) * (W + 40)) - 20;
    const y = H - mod(n * 46 - cam * 0.4, H + 120) + 60;
    if (y < -24 || y > H + 24) continue;
    g.fillRect(x + 8, y, w - 16, 6);
    g.fillRect(x, y + 5, w, 7);
    g.fillRect(x + 5, y + 11, w - 10, 4);
  }
}

function sky(g: CanvasRenderingContext2D, cam: number, p: readonly string[], ink: Ink) {
  // thin high cloud, well below the branches in contrast
  clouds(g, cam * 0.6, p, ink);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(h2(i, 1) * W);
    const sy = mod(h2(i, 2) * (H + 200) - cam * 0.18, H + 60);
    if (sy > H) continue;
    g.fillStyle = p[h2(i, 3) > 0.5 ? ink.mid : ink.soft];
    g.fillRect(Math.round(x), Math.round(sy), 1, 1);
  }
  // a thin moon
  const my = H - (1500 - cam) * 0.1 - 40;
  if (my > -30 && my < H + 30) {
    g.fillStyle = p[ink.soft];
    g.beginPath();
    g.arc(128, my, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p[ink.bg];
    g.beginPath();
    g.arc(123, my - 3, 12, 0, Math.PI * 2);
    g.fill();
  }
}

/* ------------------------------- the scene ------------------------------- */

const toScreen = (s: GameState, y: number) => H - (y - s.camY);

function drawBranch(
  g: CanvasRenderingContext2D,
  b: GameState["branches"][number],
  y: number,
  p: readonly string[],
  ink: Ink,
  t: number,
) {
  const x = Math.round(b.x);

  if (b.kind === "weak") {
    g.fillStyle = p[ink.mid];
    for (let i = 0; i < b.w; i += 5) g.fillRect(x + i, y, 3, 2);
    return;
  }

  if (b.kind === "spring") {
    g.fillStyle = p[ink.ink];
    g.fillRect(x, y, b.w, 3);
    // a coiled pad that bobs
    const bob = Math.sin(t * 6) > 0 ? 1 : 0;
    const cx = x + b.w / 2;
    g.fillStyle = p[ink.mid];
    g.fillRect(cx - 7, y - 4 - bob, 14, 3);
    g.fillRect(cx - 5, y - 7 - bob, 10, 2);
    g.fillStyle = p[ink.ink];
    g.fillRect(cx - 7, y - 2, 14, 1);
    return;
  }

  g.fillStyle = p[ink.ink];
  g.fillRect(x, y, b.w, 3);
  g.fillStyle = p[ink.mid];
  g.fillRect(x, y + 3, b.w, 1);

  if (b.kind === "moving") {
    // little arrows so it reads as a platform that travels
    g.fillStyle = p[ink.mid];
    const d = b.vx > 0 ? 1 : -1;
    const cx = x + b.w / 2;
    for (let i = 0; i < 3; i++) g.fillRect(cx + d * (i * 3) - 1, y - 3, 2, 2);
    return;
  }

  g.fillStyle = p[ink.soft];
  for (let i = 2; i < b.w - 2; i += 10) g.fillRect(x + i, y - 2, 2, 2);
}

export function drawGame(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  const p = pal.colors;
  const zi = zoneAt(s.camY + H * 0.5);
  const ink = ZONE_INK[zi];

  g.fillStyle = p[ink.bg];
  g.fillRect(0, 0, W, H);

  g.save();
  if (s.shake > 0.2) {
    g.translate(
      Math.round((Math.random() - 0.5) * s.shake),
      Math.round((Math.random() - 0.5) * s.shake),
    );
  }

  if (zi === 0) bark(g, s.camY, p, ink);
  else if (zi === 1) canopy(g, s.camY, p, ink);
  else if (zi === 2) clouds(g, s.camY, p, ink);
  else sky(g, s.camY, p, ink);

  // the top, once it is in sight
  const goalY = toScreen(s, GOAL);
  if (goalY > -24 && goalY < H + 24) {
    g.fillStyle = p[ink.ink];
    g.fillRect(0, goalY, W, 2);
    for (let i = 0; i < W; i += 8) g.fillRect(i, goalY + 2, 4, 2);
    text(g, "THE TOP", W / 2, goalY - 12, 8, p[ink.ink], "center");
  }

  for (const b of s.branches) {
    if (b.broken) continue;
    const y = toScreen(s, b.y);
    if (y < -10 || y > H + 10) continue;
    drawBranch(g, b, y, p, ink, s.t);
  }

  for (const l of s.leaves) {
    if (l.got) continue;
    const y = toScreen(s, l.y);
    if (y < -6 || y > H + 6) continue;
    const bob = Math.sin(s.t * 3 + l.x) * 1.5;
    g.fillStyle = p[ink.mid];
    g.fillRect(l.x - 1, Math.round(y + bob) - 3, 2, 6);
    g.fillRect(l.x - 3, Math.round(y + bob) - 1, 6, 2);
    g.fillStyle = p[ink.ink];
    g.fillRect(l.x - 1, Math.round(y + bob) - 1, 2, 2);
  }

  fx.draw(g, (y) => toScreen(s, y), [p[ink.ink], p[ink.mid]]);

  // the climber, posed by what they are doing
  const pose = s.vy > 60 ? RISING : s.vy < -60 ? FALLING : IDLE;
  const shades = [p[ink.ink], p[ink.mid], p[ink.bg]];
  const py = toScreen(s, s.py) - PLAYER_H;
  blit(g, pose, s.px, py, s.facing < 0, shades);
  if (s.px > W - PLAYER_W) blit(g, pose, s.px - W - PLAYER_W, py, s.facing < 0, shades);
  else if (s.px < 0) blit(g, pose, s.px + W + PLAYER_W, py, s.facing < 0, shades);

  g.restore();

  drawHud(g, s, p, ink);

  // Steering is the only control; say so once, early, then get out of the way.
  if (s.height < 110 && s.zoneBanner <= 0) {
    text(g, "◀ ▶ TO STEER", W / 2, H - 14, 8, p[ink.mid], "center");
  }

  // A small label under the score, not a bar across the middle of the jump.
  if (s.zoneBanner > 0) {
    const blink = s.zoneBanner > 1.5 && Math.floor(s.t * 6) % 2 === 0;
    if (!blink) text(g, ZONES[s.zone].name, W / 2, 5, 8, p[ink.mid], "center");
  }
}

function drawHud(
  g: CanvasRenderingContext2D,
  s: GameState,
  p: readonly string[],
  ink: Ink,
) {
  // progress rail
  const top = 16;
  const bottom = H - 12;
  g.fillStyle = p[ink.mid];
  g.fillRect(W - 6, top, 2, bottom - top);
  for (const z of ZONES) {
    const zy = bottom - (bottom - top) * Math.min(1, z.from / GOAL);
    g.fillRect(W - 8, zy, 6, 1);
  }
  const marker = bottom - (bottom - top) * Math.min(1, s.py / GOAL);
  g.fillStyle = p[ink.ink];
  g.fillRect(W - 9, marker - 1, 8, 3);

  text(g, String(s.score).padStart(5, "0"), 4, 4, 8, p[ink.ink]);

  if (s.combo > 1) {
    const flash = Math.floor(s.t * 8) % 2 === 0;
    text(g, `${s.combo}x`, 4, 15, 8, p[flash ? ink.ink : ink.mid]);
  }

  // wind sock
  if (Math.abs(s.wind) > 4) {
    const dir = s.wind > 0 ? 1 : -1;
    const strength = Math.min(3, Math.round(Math.abs(s.wind) / 12) + 1);
    g.fillStyle = p[ink.mid];
    for (let i = 0; i < strength; i++) {
      const y = 6 + i * 4;
      g.fillRect(W / 2 - 10 + (dir > 0 ? 0 : 4), y, 14, 1);
      g.fillRect(W / 2 + dir * 5, y - 1, 2, 3);
    }
  }
}

/* -------------------------------- screens -------------------------------- */

function panel(g: CanvasRenderingContext2D, p: readonly string[]) {
  g.fillStyle = p[3];
  g.fillRect(0, 0, W, H);
  g.fillStyle = p[1];
  g.fillRect(0, 0, W, 2);
  g.fillRect(0, H - 2, W, 2);
}

export function drawTitle(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  const p = pal.colors;
  panel(g, p);

  // Canopy narrows toward the top; the trunk holds it up.
  g.fillStyle = p[1];
  for (let i = 0; i < 4; i++) {
    const w = 16 + i * 10;
    g.fillRect(W / 2 - w / 2, 30 + i * 9, w, 8);
  }
  g.fillStyle = p[0];
  g.fillRect(W / 2 - 2, 66, 4, 18);
  g.fillRect(W / 2 - 12, 84, 24, 2);

  // a climber waiting at the foot of it
  blit(g, IDLE, W / 2 + 16, 73, false, [p[0], p[1], p[3]]);

  text(g, SITE.cartridge, W / 2, 10, 12, p[0], "center");
  text(g, `${SITE.event.toUpperCase()} ${SITE.year}`, W / 2, 92, 8, p[1], "center");

  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "PRESS START", W / 2, 108, 8, p[0], "center");
  }
  if (s.best > 0) text(g, `BEST ${String(s.best).padStart(5, "0")}`, W / 2, 121, 8, p[1], "center");
  // Rotate the footer rather than crowd two lines onto a 144px screen.
  const footer = Math.floor(s.t / 3.5) % 2 === 0 ? "MESSAGE AT THE TOP" : "SELECT: COLOUR";
  text(g, footer, W / 2, 132, 8, p[1], "center");
}

export function drawDemo(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  drawGame(g, s, pal);
  const p = pal.colors;
  const zi = zoneAt(s.camY + H * 0.5);
  const ink = ZONE_INK[zi];
  if (Math.floor(s.t * 1.6) % 2 === 0) {
    text(g, "DEMO", W / 2, H - 22, 8, p[ink.ink], "center");
  }
  text(g, "PRESS START", W / 2, H - 12, 8, p[ink.mid], "center");
}

export function drawPaused(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  drawGame(g, s, pal);
  const p = pal.colors;
  g.fillStyle = p[0];
  g.fillRect(0, 58, W, 28);
  text(g, "PAUSED", W / 2, 66, 12, p[3], "center");
  text(g, "START TO RESUME", W / 2, H - 14, 8, p[0], "center");
}

export function drawDead(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  const p = pal.colors;
  panel(g, p);
  text(g, "YOU FELL", W / 2, 22, 12, p[0], "center");

  const pct = Math.round((s.height / GOAL) * 100);
  text(g, `SCORE ${String(s.score).padStart(5, "0")}`, W / 2, 50, 8, p[0], "center");
  text(g, `BEST  ${String(s.best).padStart(5, "0")}`, W / 2, 62, 8, p[1], "center");
  text(g, `${ZONES[zoneAt(s.height)].name}`, W / 2, 80, 8, p[1], "center");

  // how far up, as a bar
  g.fillStyle = p[2];
  g.fillRect(24, 94, 112, 6);
  g.fillStyle = p[0];
  g.fillRect(24, 94, Math.round(112 * Math.min(1, s.height / GOAL)), 6);
  text(g, `${pct}% UP`, W / 2, 104, 8, p[1], "center");

  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "PRESS START", W / 2, 124, 8, p[0], "center");
  }
}

export function drawWon(g: CanvasRenderingContext2D, s: GameState, pal: Palette) {
  const p = pal.colors;
  // the summit is night — keep the inverted look of the last zone
  g.fillStyle = p[0];
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 40; i++) {
    const x = Math.floor(h2(i, 5) * W);
    const y = Math.floor(h2(i, 6) * H);
    g.fillStyle = h2(i, 9) > 0.5 ? p[3] : p[2];
    g.fillRect(x, y, 1, 1);
  }
  // fireworks
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const r = ((s.t * 46) % 60) + 6;
    g.fillStyle = i % 2 ? p[3] : p[2];
    g.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(44 + Math.sin(a) * r), 2, 2);
  }

  text(g, "YOU MADE IT", W / 2, 16, 12, p[3], "center");
  text(g, SITE.name.toUpperCase(), W / 2, 74, 8, p[3], "center");
  text(g, "THAT WAS THE GAME.", W / 2, 88, 8, p[2], "center");
  text(g, "HERE IS THE REST", W / 2, 100, 8, p[3], "center");
  text(g, `SCORE ${String(s.score).padStart(5, "0")}`, W / 2, 116, 8, p[2], "center");
  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "LOOK DOWN", W / 2, 130, 8, p[3], "center");
  }
}

/** Two cards after the boot chime, so nobody plays without knowing why. */
export const INTRO_PAGES = 2;
export const INTRO_PAGE_MS = [3800, 4600];

export function drawIntro(
  g: CanvasRenderingContext2D,
  pal: Palette,
  page: number,
  t: number,
) {
  const p = pal.colors;
  panel(g, p);

  // 12px type fits about 11 characters across 160px; 8px fits about 18.
  if (page === 0) {
    text(g, "FOR THE ORGANIZERS", W / 2, 22, 8, p[1], "center");
    text(g, "THIS IS MY", W / 2, 44, 12, p[0], "center");
    text(g, SITE.event.toUpperCase(), W / 2, 62, 12, p[0], "center");
    text(g, "APPLICATION", W / 2, 80, 12, p[0], "center");
    text(g, "YES, REALLY.", W / 2, 108, 8, p[1], "center");
  } else {
    text(g, `YOU READ ${SITE.volume} OF`, W / 2, 20, 8, p[1], "center");
    text(g, "THESE. MINE IS", W / 2, 32, 8, p[1], "center");
    text(g, "A VIDEO GAME.", W / 2, 44, 8, p[1], "center");

    text(g, "THE REST OF IT IS", W / 2, 68, 8, p[0], "center");
    text(g, "AT THE TOP OF", W / 2, 80, 8, p[0], "center");
    text(g, "THE TREE.", W / 2, 92, 8, p[0], "center");

    text(g, "CLIMB IT.", W / 2, 112, 12, p[0], "center");
  }

  if (Math.floor(t * 2) % 2 === 0) {
    text(g, "PRESS START", W / 2, 132, 8, p[1], "center");
  }
}

export function drawBoot(g: CanvasRenderingContext2D, t: number, pal: Palette) {
  const p = pal.colors;
  g.fillStyle = p[3];
  g.fillRect(0, 0, W, H);

  // The logo slides down and settles, the way the original did.
  const settle = Math.min(1, t / 1.5);
  const eased = 1 - Math.pow(1 - settle, 3);
  const y = -34 + eased * 92;

  g.fillStyle = p[1];
  for (let i = 0; i < 3; i++) {
    const w = 14 + i * 10;
    g.fillRect(W / 2 - w / 2, y + i * 7, w, 6);
  }
  g.fillStyle = p[0];
  g.fillRect(W / 2 - 2, y + 21, 4, 14);
  if (t > 1.65) text(g, SITE.name.toUpperCase(), W / 2, y + 46, 8, p[1], "center");
}

/* ------------------------------ screen effect ----------------------------- */

/** LCD grid + glass. Drawn once per frame over the upscaled buffer. */
export function lcdOverlay(g: CanvasRenderingContext2D, w: number, h: number, scale: number) {
  if (scale >= 3) {
    g.fillStyle = "rgba(0,0,0,0.10)";
    for (let y = 0; y < h; y += scale) g.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += scale) g.fillRect(x, 0, 1, h);
  }
  const glare = g.createLinearGradient(0, 0, w * 0.6, h);
  glare.addColorStop(0, "rgba(255,255,255,0.14)");
  glare.addColorStop(0.35, "rgba(255,255,255,0.03)");
  glare.addColorStop(0.55, "rgba(255,255,255,0)");
  g.fillStyle = glare;
  g.fillRect(0, 0, w, h);
}
