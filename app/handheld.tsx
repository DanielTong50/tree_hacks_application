"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  duckMusic,
  isMuted,
  musicRunning,
  setMuted,
  setMusicZone,
  sfx,
  startMusic,
  stopMusic,
  unlock,
} from "@/lib/audio";
import { botInput } from "@/lib/bot";
import {
  INTRO_PAGES,
  INTRO_PAGE_MS,
  PALETTES,
  drawBoot,
  drawIntro,
  drawDead,
  drawDemo,
  drawGame,
  drawPaused,
  drawTitle,
  drawWon,
  lcdOverlay,
} from "@/lib/draw";
import * as fx from "@/lib/fx";
import { paletteStore } from "@/lib/palette-store";
import { H, W, newGame, start, step, type GameState } from "@/lib/game";
import { SITE } from "@/lib/site";
import Welcome from "./welcome";

const BOOT_MS = 2600;
const WELCOME_EXIT_MS = 750;
const BEST_KEY = "treeclimb_best";
/** How long the title screen waits before the console starts playing itself. */
const ATTRACT_AFTER = 11;
const ATTRACT_OUTRO = 2.6;

type Action = "left" | "right" | "start" | "select" | "a" | "b";

export default function Handheld() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);

  const [won, setWon] = useState(false);
  // Nobody should have to be good at a game to read why the page exists.
  const [revealed, setRevealed] = useState(false);
  const [sound, setSound] = useState(false);
  const [powered, setPowered] = useState(false);
  const paletteIndex =
    useSyncExternalStore(
      paletteStore.subscribe,
      paletteStore.snapshot,
      paletteStore.serverSnapshot,
    ) % PALETTES.length;
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [demo, setDemo] = useState(false);
  const [welcome, setWelcome] = useState<"up" | "leaving" | "gone">("up");
  /** The console sits dark behind the welcome screen and boots when it lifts. */
  const welcomeUp = useRef(true);

  const game = useRef<GameState | null>(null);
  const input = useRef({ left: false, right: false });
  const bootAt = useRef(0);
  const scale = useRef(3);
  const attract = useRef(false);
  const idleFor = useRef(0);
  const outro = useRef(0);
  /** Audio can only start inside a gesture, so the first one switches it on. */
  const touched = useRef(false);
  const introAt = useRef(0);
  const introPage = useRef(0);
  const introDone = useRef(false);

  /** Advances the intro cards; any button skips ahead. */
  const advanceIntro = useCallback((now: number) => {
    introPage.current += 1;
    if (introPage.current >= INTRO_PAGES) introDone.current = true;
    else introAt.current = now;
  }, []);

  const mark = useCallback((key: string, on: boolean) => {
    setPressed((p) => (p[key] === on ? p : { ...p, [key]: on }));
  }, []);

  const applyPalette = useCallback((i: number) => {
    paletteStore.set(((i % PALETTES.length) + PALETTES.length) % PALETTES.length);
  }, []);

  const firstGesture = useCallback(() => {
    if (touched.current) return;
    touched.current = true;
    unlock();
    setMuted(false);
    setSound(true);
    sfx.boot();
  }, []);

  const enter = useCallback(() => {
    if (!welcomeUp.current) return;
    welcomeUp.current = false;
    bootAt.current = performance.now();
    firstGesture();
    setWelcome("leaving");
    setTimeout(() => setWelcome("gone"), WELCOME_EXIT_MS);
  }, [firstGesture]);

  /* --------------------------------- input -------------------------------- */

  const press = useCallback(
    (action: Action) => {
      firstGesture();
      const g = game.current;
      if (!g) return;

      idleFor.current = 0;

      // While the intro is up, every button just moves it along.
      if (!introDone.current) {
        advanceIntro(performance.now());
        return;
      }

      // Any input drops out of attract mode and hands the console back.
      if (attract.current) {
        attract.current = false;
        setDemo(false);
        outro.current = 0;
        fx.clear();
        stopMusic();
        game.current = newGame(g.best);
        if (action !== "start" && action !== "a" && action !== "b") return;
      }

      const s = game.current;
      if (!s) return;

      if (action === "left") input.current.left = true;
      if (action === "right") input.current.right = true;

      if (action === "select") {
        applyPalette(paletteStore.snapshot() + 1);
        if (!isMuted()) sfx.select();
        return;
      }

      if (action === "start" || action === "a" || action === "b") {
        if (s.phase === "title" || s.phase === "dead" || s.phase === "won") {
          fx.clear();
          game.current = start(s);
          setWon(false);
          if (!isMuted()) {
            sfx.select();
            stopMusic();
            startMusic(0);
          }
        } else if (s.phase === "playing" && action === "start") {
          s.phase = "paused";
          duckMusic(true);
          if (!isMuted()) sfx.pause();
        } else if (s.phase === "paused") {
          s.phase = "playing";
          duckMusic(false);
          if (!isMuted()) sfx.pause();
        }
      }
    },
    [firstGesture, applyPalette, advanceIntro],
  );

  const release = useCallback((action: "left" | "right") => {
    input.current[action] = false;
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent, down: boolean) => {
      if (welcomeUp.current) {
        if (down && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== "Tab") {
          e.preventDefault();
          enter();
        }
        return;
      }
      const k = e.key.toLowerCase();
      let action: Action | null = null;
      if (k === "arrowleft" || k === "a") action = "left";
      else if (k === "arrowright" || k === "d") action = "right";
      else if (k === "enter" || k === " ") action = "start";
      else if (k === "shift" || k === "c") action = "select";
      else if (k === "z" || k === "x") action = "a";
      if (!action) return;

      e.preventDefault();
      if (down) {
        if (e.repeat) return;
        press(action);
        mark(action, true);
      } else {
        if (action === "left" || action === "right") release(action);
        mark(action, false);
      }
    };
    const down = (e: KeyboardEvent) => key(e, true);
    const up = (e: KeyboardEvent) => key(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [press, release, mark, enter]);

  /* ------------------------------- the loop ------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = canvas.getContext("2d");
    if (!view) return;

    const buf = document.createElement("canvas");
    buf.width = W;
    buf.height = H;
    const g = buf.getContext("2d");

    // A second buffer holds the previous frames, faded — real DMG panels
    // smeared, and without it fast falls look like teleporting.
    const ghost = document.createElement("canvas");
    ghost.width = W;
    ghost.height = H;
    const gh = ghost.getContext("2d");
    if (!g || !gh) return;

    let best = 0;
    try {
      best = parseInt(localStorage.getItem(BEST_KEY) ?? "0", 10) || 0;
    } catch {
      /* private browsing — start from zero */
    }
    game.current = newGame(best);
    bootAt.current = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const wanted = Math.max(1, Math.round((canvas.clientWidth * dpr) / W));
      const s = Math.max(1, Math.min(8, wanted));
      if (s === scale.current && canvas.width === W * s) return;
      scale.current = s;
      canvas.width = W * s;
      canvas.height = H * s;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let frame = 0;
    let last = performance.now();
    let savedBest = best;
    let lastZone = -1;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const s = game.current;
      if (!s) return;
      const pal = PALETTES[paletteStore.snapshot() % PALETTES.length];

      if (welcomeUp.current) bootAt.current = now;

      if (now - bootAt.current < BOOT_MS) {
        drawBoot(g, (now - bootAt.current) / 1000, pal);
      } else if (!introDone.current) {
        if (!powered) setPowered(true);
        if (introAt.current === 0) introAt.current = now;
        const page = introPage.current;
        if (now - introAt.current >= INTRO_PAGE_MS[page]) advanceIntro(now);
        drawIntro(g, pal, Math.min(page, INTRO_PAGES - 1), (now - introAt.current) / 1000);
      } else {
        if (!powered) setPowered(true);

        // attract mode: after a quiet spell the console plays itself
        if (s.phase === "title" && !attract.current) {
          idleFor.current += dt;
          if (idleFor.current > ATTRACT_AFTER) {
            attract.current = true;
            setDemo(true);
            fx.clear();
            game.current = start(s);
          }
        }
        const live = game.current!;
        const controls = attract.current ? botInput(live) : input.current;

        step(live, controls, dt);
        fx.update(dt);

        for (const e of live.events) {
          if (e === "jump") {
            fx.dust(live.px + 4, live.py);
            if (!isMuted()) sfx.jump();
          } else if (e === "spring") {
            fx.boost(live.px + 4, live.py);
            if (!isMuted()) sfx.spring();
          } else if (e === "break") {
            fx.splinter(live.px - 6, live.py, 20);
            if (!isMuted()) sfx.breaking();
          } else if (e === "leaf") {
            fx.sparkle(live.px + 4, live.py + 6);
            if (!isMuted()) {
              sfx.leaf();
              if (live.combo > 1) sfx.combo(live.combo);
            }
          } else if (e === "zone") {
            if (!isMuted()) sfx.zone();
          } else if (e === "die") {
            if (!isMuted()) {
              sfx.die();
              stopMusic();
            }
          } else if (e === "win") {
            if (!isMuted()) {
              stopMusic();
              sfx.win();
            }
            if (!attract.current) setWon(true);
          }
        }
        live.events.length = 0;

        if (live.phase === "playing" && live.zone !== lastZone) {
          lastZone = live.zone;
          setMusicZone(live.zone);
        }

        if (!attract.current && live.best > savedBest) {
          savedBest = live.best;
          try {
            localStorage.setItem(BEST_KEY, String(live.best));
          } catch {
            /* ignore */
          }
        }

        // demo over — hand the console back to the title screen
        if (attract.current && (live.phase === "dead" || live.phase === "won")) {
          outro.current += dt;
          if (outro.current > ATTRACT_OUTRO) {
            attract.current = false;
            setDemo(false);
            outro.current = 0;
            idleFor.current = 0;
            fx.clear();
            game.current = newGame(savedBest);
          }
        }

        const cur = game.current!;
        if (attract.current) drawDemo(g, cur, pal);
        else if (cur.phase === "title") drawTitle(g, cur, pal);
        else if (cur.phase === "playing") drawGame(g, cur, pal);
        else if (cur.phase === "paused") drawPaused(g, cur, pal);
        else if (cur.phase === "dead") drawDead(g, cur, pal);
        else drawWon(g, cur, pal);
      }

      // persistence, then blit up nearest-neighbour
      // Light touch: enough to smear a fast fall, not enough to blur text.
      gh.globalAlpha = 0.88;
      gh.drawImage(buf, 0, 0);
      gh.globalAlpha = 1;

      const k = scale.current;
      view.imageSmoothingEnabled = false;
      view.clearRect(0, 0, canvas.width, canvas.height);
      view.drawImage(ghost, 0, 0, W * k, H * k);
      lcdOverlay(view, W * k, H * k, k);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      stopMusic();
    };
    // `powered` is only ever set true from inside the loop; re-subscribing on
    // it would restart the boot animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------- pause when the tab goes away --------------------- */

  useEffect(() => {
    const onHide = () => {
      const s = game.current;
      if (document.visibilityState === "hidden") {
        stopMusic();
        if (s && s.phase === "playing") s.phase = "paused";
      } else if (s && s.phase === "playing" && !isMuted() && !musicRunning()) {
        startMusic(s.zone);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  /* --------------------------------- tilt --------------------------------- */

  useEffect(() => {
    const el = deviceRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      el.style.transform = `rotateY(${dx * 13}deg) rotateX(${-dy * 9}deg)`;
    };
    const leave = () => {
      el.style.transform = "rotateY(0deg) rotateX(0deg)";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);

  /* -------------------------------- helpers ------------------------------- */

  const hold = (action: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        // Keeps a held d-pad working if the finger slides off the button.
        // Throws if the pointer is already gone, which we don't care about.
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* no active pointer — the press still registers below */
      }
      press(action);
      mark(action, true);
    },
    onPointerUp: () => {
      release(action);
      mark(action, false);
    },
    onPointerCancel: () => {
      release(action);
      mark(action, false);
    },
    "data-on": pressed[action] ? "true" : "false",
  });

  const tap = (action: "start" | "select" | "a" | "b") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      press(action);
      mark(action, true);
    },
    onPointerUp: () => mark(action, false),
    onPointerCancel: () => mark(action, false),
    "data-on": pressed[action] ? "true" : "false",
  });

  const toggleSound = () => {
    unlock();
    const next = !sound;
    setSound(next);
    setMuted(!next);
    touched.current = true;
    if (next) {
      sfx.select();
      const s = game.current;
      if (s && s.phase === "playing") startMusic(s.zone);
    }
  };

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="room flex flex-col items-center gap-9 px-4 py-10 sm:py-14">
      {welcome !== "gone" && <Welcome leaving={welcome === "leaving"} onEnter={enter} />}
      <div className="scene">
        <div ref={deviceRef} className="device">
          <div className="bezel">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`power-led ${powered ? "" : "off"}`} />
                <span className="label text-[#8d8f9a]">power</span>
              </div>
              <span className="label text-[#8d8f9a]">
                {demo ? "attract mode" : "dot matrix"}
              </span>
            </div>
            <div
              className="lcd"
              style={{ ["--lcd" as string]: PALETTES[paletteIndex].colors[3] }}
            >
              <canvas ref={canvasRef} aria-label="Game screen" />
            </div>
          </div>

          <p className="pixel mt-4 text-center text-[11px] text-[#5e5b55]">
            {SITE.cartridge}
            <span className="text-[#8d8a84]"> ™</span>
          </p>

          <div className="mt-6 flex items-start justify-between">
            <div className="dpad">
              <button className="dpad-hit left" aria-label="Move left" {...hold("left")} />
              <button className="dpad-hit right" aria-label="Move right" {...hold("right")} />
              <span className="dpad-arm h" />
              <span className="dpad-arm v" />
              <span className="dpad-dot" />
            </div>

            <div className="ab mt-3">
              <button className="round-btn" aria-label="B button" {...tap("b")}>
                B
              </button>
              <button className="round-btn -mt-5" aria-label="A button" {...tap("a")}>
                A
              </button>
            </div>
          </div>

          {/* Labels ride inside the rotated row, or they shear off the buttons. */}
          <div className="mt-8 flex justify-center">
            <div className="start-row">
              <div className="flex flex-col items-center gap-2">
                <button
                  className="pill-btn"
                  aria-label="Select — change colour"
                  {...tap("select")}
                />
                <span className="label text-[#6f6c66]">select</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  className="pill-btn"
                  aria-label="Start — play or pause"
                  {...tap("start")}
                />
                <span className="label text-[#6f6c66]">start</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end pr-1">
            <div className="grille">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
          </div>

          <div className="seam mt-4" />
        </div>
      </div>

      {/* chrome under the desk */}
      <div className="flex w-full max-w-xl flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <p className="label whitespace-nowrap text-center text-dimmer">
            ◀ ▶ or d-pad to climb · start to begin
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="label whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-dim transition-colors hover:text-text"
            >
              {sound ? "♪ sound on" : "sound off"}
            </button>
            <button
              onClick={() => {
                firstGesture();
                applyPalette(paletteStore.snapshot() + 1);
                if (!isMuted()) sfx.select();
              }}
              className="label whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-dim transition-colors hover:text-text"
            >
              {PALETTES[paletteIndex].name}
            </button>
          </div>
        </div>

        {!won && !revealed && (
          <div className="flex flex-col items-center gap-3">
            <p className="hint label text-center text-dimmer">
              this is my {SITE.event.toLowerCase()} application · the rest is at the top
            </p>
            <button
              onClick={() => setRevealed(true)}
              className="label text-dimmer underline underline-offset-4 transition-colors hover:text-dim"
            >
              or just read it
            </button>
          </div>
        )}

        {(won || revealed) && (
          <div className="reveal w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur">
            <p className="label mb-5 text-dimmer">
              {SITE.event.toLowerCase()} {SITE.year} · application
            </p>
            <h1
              className="pixel mb-5 text-lg leading-relaxed"
              style={{ fontFamily: "var(--font-pixel-face), monospace" }}
            >
              {SITE.name}
            </h1>
          </div>
        )}
      </div>
    </div>
  );
}
