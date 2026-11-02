import { PLAYER_W, W, type GameState, type Input } from "./game";

/**
 * A competent-but-fallible player. Drives attract mode on the title screen,
 * and doubles as the harness that proves the game is winnable.
 *
 * Aims at the next branch up while rising and at whatever it can still catch
 * while falling — which is roughly what a person does, including the part
 * where it sometimes misses.
 */
export function botInput(s: GameState): Input {
  let target: number | null = null;
  let bestDy = Infinity;
  const falling = s.vy < 0;

  for (const b of s.branches) {
    if (b.broken) continue;
    const dy = b.y - s.py;
    if (falling) {
      if (dy < -1 && -dy < bestDy) {
        bestDy = -dy;
        target = b.x + b.w / 2;
      }
    } else if (dy > 2 && dy < bestDy) {
      bestDy = dy;
      target = b.x + b.w / 2;
    }
  }
  if (target === null) return { left: false, right: false };

  // Shortest way round, since the trunk wraps.
  let d = target - (s.px + PLAYER_W / 2);
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;

  return { left: d < -1.5, right: d > 1.5 };
}
