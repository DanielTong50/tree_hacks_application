# TREE CLIMB

A handheld console sitting on a desk. It boots with a chime, runs a real
playable game at the Game Boy's native 160×144, has a soundtrack, and tilts as
you move the mouse. Climb the tree through four zones, reach the top, and the
win screen tells you why the page exists.

It opens by saying what it is, in as many words — *this is my TreeHacks
application* — and that the rest of it is at the top of the tree. Leave it
alone for ten seconds and it starts playing itself.

## Controls

| | |
|---|---|
| ◀ ▶ / A D / d-pad | climb |
| START / Enter | begin, and pause mid-run |
| SELECT / Shift | cycle the LCD palette |

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No keys, no services, no backend. Three runtime dependencies. `npm run build
&& npm start` deploys anywhere, Vercel included.

## What's in it

**An intro card.** Two screens after the boot chime, addressed to the people
reading the application: *for the organizers — this is my TreeHacks
application. Yes, really.* Then: *you read 3000 of these; mine is a video
game. The rest of it is at the top of the tree.* Any button skips ahead, and
the title screen keeps reminding you.

**Four zones.** The trunk teaches you the jump. The canopy adds branches that
snap under you. The clouds add branches that travel and a crosswind. Above it
all, springs launch you between thin gaps under a sky full of stars.

Zones are deliberately *quiet*. An earlier version swapped background and ink
per zone and threw a banner across the middle of the screen — dramatic, but it
pulled your eye off the branch you were aiming at mid-jump. Now the zone name
appears once as a small label under the score, and the zones read through
their scenery: bark, then foliage, then cloud, then stars.

**A soundtrack.** A four-track sequencer — lead, bass, hat — scheduled against
the Web Audio clock with lookahead, so it doesn't drift. The pattern changes
with the zone. Every sound in the project is synthesised; there are no audio
files.

**Attract mode.** Idle on the title screen and the console plays itself, using
the same bot that the test harness uses to prove the game is winnable. Any
input hands it back.

**Four palettes.** DMG green, Pocket grey, Berry, Cardinal. SELECT cycles them
and the glass glow follows. The choice is remembered.

**Arcade feel.** Screen shake, bark dust on landing, splinters off a snapped
branch, sparkles on a leaf, a combo meter, LCD ghosting, a one-line steering
tutorial for the first few metres, and three climber poses depending on
whether you're rising, falling, or standing.

## How it works

The game is a **pure, deterministic module** — `step(state, input, elapsed)`
returns the next state and touches no DOM, so a bot can play it in a test
harness as easily as a person can play it in a browser. The same seed with the
same inputs always produces the same run. It advances in fixed 1/60s increments
with a capped catch-up, so a backgrounded tab doesn't simulate a huge burst on
return.

Rendering goes into an offscreen 160×144 buffer, through a second buffer that
holds faded previous frames for LCD persistence, then gets blitted up with
smoothing off so pixels stay square at any size. The console body is CSS:
layered gradients, inset shadows, and a 3D transform that follows the pointer.

| Path | |
|---|---|
| `lib/site.ts` | Your details. The only file you need to edit. |
| `lib/game.ts` | The cartridge — physics, zones, branch kinds, wind, scoring. No rendering. |
| `lib/draw.ts` | Everything that paints the LCD, in four shades. |
| `lib/audio.ts` | The sound chip and the sequencer. |
| `lib/bot.ts` | Plays the game. Drives attract mode; doubles as the test player. |
| `lib/fx.ts` | Particles. Kept out of game state so the sim stays deterministic. |
| `app/handheld.tsx` | The console shell, input, and the frame loop. |

### Tuning

The constants at the top of `lib/game.ts` are the whole difficulty curve, and
`ZONES` decides which mechanics appear where. Two things matter most:

- **The camera offset** has to clear the jump height (~60px) by a wide margin,
  or a single missed branch is instant death.
- **Branch density** has to beat the jump height too. A 60px jump over 28px
  gaps means you sail *past* the next branch rather than onto it, and a miss
  then falls through everything.

Both were real bugs before they were tuning notes. A competent run reaches the
top in 16–22 seconds.
