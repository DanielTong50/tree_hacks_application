/**
 * Everything that paints the 160x144 LCD. Drawn into an offscreen buffer at
 * native resolution and blitted up with smoothing off, so every pixel stays
 * square no matter how large the console is on screen.
 */

import { GOAL, H, PLAYER_H, PLAYER_W, W, type GameState } from "./game";
import { SITE } from "./site";

/** The original DMG four, darkest to lightest. */
export const DMG = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const;

export const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

/* -------------------------------- sprites -------------------------------- */

const CLIMBER = [
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

function blit(
  g: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  flip: boolean,
  shades: readonly string[],
) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const shade = shades[Number(ch) - 1];
      if (!shade) continue;
      g.fillStyle = shade;
      g.fillRect(x + (flip ? row.length - 1 - c : c), y + r, 1, 1);
    }
  }
}

/* --------------------------------- text ---------------------------------- */

export function text(
  g: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 8,
  color: string = DMG[0],
  align: CanvasTextAlign = "left",
) {
  g.font = `${size}px ${PIXEL_FONT}`;
  g.textAlign = align;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.textAlign = "left";
}

/** Wraps to a pixel width, assuming the font's fixed advance. */
export function wrap(str: string, perLine: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of str.split(/\s+/)) {
    if (!line.length) line = word;
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

/* ------------------------------- the scene ------------------------------- */

const worldToScreen = (s: GameState, y: number) => H - (y - s.camY);

function drawTrunk(g: CanvasRenderingContext2D, s: GameState) {
  // Parallax bark stripes, so climbing reads as motion even between branches.
  g.fillStyle = DMG[2];
  const drift = Math.floor(s.camY * 0.35) % 24;
  for (let i = -1; i < H / 24 + 2; i++) {
    const y = i * 24 + drift;
    g.fillRect(0, y, 3, 12);
    g.fillRect(W - 3, y + 12, 3, 12);
  }
}

function drawBranch(g: CanvasRenderingContext2D, x: number, y: number, w: number, weak: boolean) {
  if (weak) {
    // dashed, so it reads as unsafe at a glance
    g.fillStyle = DMG[1];
    for (let i = 0; i < w; i += 4) g.fillRect(x + i, y, 2, 2);
    return;
  }
  g.fillStyle = DMG[0];
  g.fillRect(x, y, w, 3);
  g.fillStyle = DMG[1];
  g.fillRect(x, y + 3, w, 1);
  g.fillStyle = DMG[2];
  for (let i = 2; i < w - 2; i += 9) g.fillRect(x + i, y - 2, 2, 2);
}

export function drawGame(g: CanvasRenderingContext2D, s: GameState) {
  g.fillStyle = DMG[3];
  g.fillRect(0, 0, W, H);
  drawTrunk(g, s);

  // goal band, once it comes into view
  const goalY = worldToScreen(s, GOAL);
  if (goalY > -20 && goalY < H + 20) {
    g.fillStyle = DMG[1];
    g.fillRect(0, goalY, W, 2);
    text(g, "TOP", W / 2, goalY - 11, 8, DMG[0], "center");
  }

  for (const b of s.branches) {
    if (b.broken) continue;
    const y = worldToScreen(s, b.y);
    if (y < -8 || y > H + 8) continue;
    drawBranch(g, b.x, y, b.w, b.weak);
  }

  for (const l of s.leaves) {
    if (l.got) continue;
    const y = worldToScreen(s, l.y);
    if (y < -6 || y > H + 6) continue;
    g.fillStyle = DMG[1];
    g.fillRect(l.x - 1, y - 3, 2, 6);
    g.fillRect(l.x - 3, y - 1, 6, 2);
    g.fillStyle = DMG[0];
    g.fillRect(l.x - 1, y - 1, 2, 2);
  }

  // climber
  const py = worldToScreen(s, s.py) - PLAYER_H;
  blit(g, CLIMBER, s.px, py, s.facing < 0, [DMG[0], DMG[1], DMG[3]]);
  // and again across the seam while wrapping
  if (s.px > W - PLAYER_W) blit(g, CLIMBER, s.px - W - PLAYER_W, py, s.facing < 0, [DMG[0], DMG[1], DMG[3]]);
  else if (s.px < 0) blit(g, CLIMBER, s.px + W + PLAYER_W, py, s.facing < 0, [DMG[0], DMG[1], DMG[3]]);

  drawHud(g, s);
}

function drawHud(g: CanvasRenderingContext2D, s: GameState) {
  // height meter down the right edge
  const top = 14;
  const bottom = H - 10;
  g.fillStyle = DMG[2];
  g.fillRect(W - 6, top, 2, bottom - top);
  const pct = Math.min(1, s.py / GOAL);
  const marker = bottom - (bottom - top) * pct;
  g.fillStyle = DMG[0];
  g.fillRect(W - 8, marker - 1, 6, 2);

  text(g, String(Math.max(0, s.height)).padStart(4, "0"), 4, 4, 8, DMG[0]);
  if (s.leavesGot > 0) text(g, `*${s.leavesGot}`, 4, 14, 8, DMG[1]);
}

/* -------------------------------- screens -------------------------------- */

function panel(g: CanvasRenderingContext2D) {
  g.fillStyle = DMG[3];
  g.fillRect(0, 0, W, H);
  g.fillStyle = DMG[1];
  g.fillRect(0, 0, W, 2);
  g.fillRect(0, H - 2, W, 2);
}

export function drawTitle(g: CanvasRenderingContext2D, s: GameState) {
  panel(g);

  // a little tree
  g.fillStyle = DMG[0];
  g.fillRect(W / 2 - 2, 52, 4, 34);
  g.fillStyle = DMG[1];
  for (let i = 0; i < 4; i++) {
    const w = 46 - i * 10;
    g.fillRect(W / 2 - w / 2, 34 + i * 10, w, 7);
  }

  text(g, SITE.cartridge, W / 2, 14, 12, DMG[0], "center");
  text(g, `${SITE.event.toUpperCase()} ${SITE.year}`, W / 2, 30, 8, DMG[1], "center");

  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "PRESS START", W / 2, 100, 8, DMG[0], "center");
  }
  if (s.best > 0) text(g, `BEST ${s.best}`, W / 2, 118, 8, DMG[1], "center");
  text(g, "◀ ▶ TO CLIMB", W / 2, 130, 8, DMG[1], "center");
}

export function drawDead(g: CanvasRenderingContext2D, s: GameState) {
  panel(g);
  text(g, "YOU FELL", W / 2, 34, 12, DMG[0], "center");
  text(g, `HEIGHT ${s.height}`, W / 2, 62, 8, DMG[0], "center");
  text(g, `BEST   ${s.best}`, W / 2, 76, 8, DMG[1], "center");
  text(g, `${Math.round((s.height / GOAL) * 100)}% UP`, W / 2, 94, 8, DMG[1], "center");
  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "PRESS START", W / 2, 118, 8, DMG[0], "center");
  }
}

export function drawWon(g: CanvasRenderingContext2D, s: GameState) {
  panel(g);

  // confetti that settles as the tune plays
  const n = 26;
  for (let i = 0; i < n; i++) {
    const seed = i * 37;
    const x = (seed * 13) % W;
    const y = ((seed * 7 + s.t * 34) % (H + 20)) - 10;
    g.fillStyle = i % 2 ? DMG[1] : DMG[2];
    g.fillRect(x, y, 2, 2);
  }

  text(g, "YOU MADE IT", W / 2, 26, 12, DMG[0], "center");
  text(g, "TO THE TOP", W / 2, 44, 8, DMG[1], "center");
  text(g, SITE.name.toUpperCase(), W / 2, 70, 8, DMG[0], "center");
  text(g, "WOULD LIKE TO", W / 2, 84, 8, DMG[1], "center");
  text(g, `ATTEND ${SITE.event.toUpperCase()}`, W / 2, 98, 8, DMG[0], "center");
  if (Math.floor(s.t * 2) % 2 === 0) {
    text(g, "LOOK DOWN ▼", W / 2, 124, 8, DMG[1], "center");
  }
}

export function drawBoot(g: CanvasRenderingContext2D, t: number) {
  g.fillStyle = DMG[3];
  g.fillRect(0, 0, W, H);

  // The logo slides down and settles, the way the original did.
  const settle = Math.min(1, t / 1.5);
  const eased = 1 - Math.pow(1 - settle, 3);
  const y = -30 + eased * 92;

  g.fillStyle = DMG[0];
  g.fillRect(W / 2 - 2, y + 16, 4, 16);
  g.fillStyle = DMG[1];
  for (let i = 0; i < 3; i++) {
    const w = 34 - i * 10;
    g.fillRect(W / 2 - w / 2, y + i * 7, w, 5);
  }

  if (t > 1.6) text(g, SITE.name.toUpperCase(), W / 2, y + 44, 8, DMG[1], "center");
}

/* ------------------------------ screen effect ----------------------------- */

/** LCD grid + glass. Drawn once per frame over the upscaled buffer. */
export function lcdOverlay(g: CanvasRenderingContext2D, w: number, h: number, scale: number) {
  if (scale >= 3) {
    g.fillStyle = "rgba(15,56,15,0.10)";
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
