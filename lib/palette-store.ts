/**
 * Which LCD palette the console is set to, backed by localStorage.
 *
 * Modelled as an external store rather than effect-synced state so the value
 * is already correct on the first client render — no hydration mismatch and
 * no flash of the default palette for a returning visitor.
 */

const KEY = "treeclimb_palette";
const listeners = new Set<() => void>();
let cache: number | null = null;

function read(): number {
  if (cache !== null) return cache;
  try {
    const n = parseInt(localStorage.getItem(KEY) ?? "0", 10);
    cache = Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    cache = 0; // private browsing — default palette
  }
  return cache;
}

export const paletteStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  snapshot: read,
  /** Server render always uses the default. */
  serverSnapshot: () => 0,
  set(next: number) {
    cache = Math.max(0, next);
    try {
      localStorage.setItem(KEY, String(cache));
    } catch {
      /* ignore */
    }
    for (const l of listeners) l();
  },
};
