# TREE CLIMB

A handheld console sitting on a desk. It boots with a chime, runs a real
playable game at the Game Boy's native 160×144, and tilts as you move the
mouse. Climb the tree, reach the top, and the win screen tells you why the
page exists.

Arrow keys or A/D to climb, Enter to start, or tap the d-pad on a phone.

## Fill this in first

Everything personal is in **`lib/site.ts`**. Search for `FILL_ME` — one real
sentence and your links. It renders in amber in the reveal card so it can't
ship by accident.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No keys, no services, no backend. `npm run build && npm start` deploys
anywhere, Vercel included.

## How it works

The game is a **pure, deterministic module** — `step(state, input, elapsed)`
returns the next state and touches no DOM, so it can be played by a bot in a
test harness as easily as by a person. It advances in fixed 1/60s increments
with a capped catch-up, so a backgrounded tab doesn't simulate a huge burst
on return, and the same seed with the same inputs always produces the same
run.

Rendering goes into an offscreen 160×144 buffer and gets blitted up with
smoothing off, so pixels stay square at any console size. Sound is synthesised
square waves — no audio files. The console body is CSS: layered gradients,
inset shadows, and a 3D transform that follows the pointer.

| Path | |
|---|---|
| `lib/site.ts` | Your details. The only file you need to edit. |
| `lib/game.ts` | The cartridge — physics, branch generation, win/lose. No rendering. |
| `lib/draw.ts` | Everything that paints the LCD, in four greens. |
| `lib/audio.ts` | The sound chip. Lazily started, since browsers block audio before a gesture. |
| `app/handheld.tsx` | The console shell, input, and the frame loop. |

### Tuning the game

The numbers at the top of `lib/game.ts` are the whole difficulty curve.
`GOAL` is how far up the top is; branch spacing and width are in `grow()`.
The camera offset matters most — it has to clear the jump height by a wide
margin or a single missed branch becomes instant death.
