"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMuted, setMuted, sfx, unlock } from "@/lib/audio";
import {
  drawBoot,
  drawDead,
  drawGame,
  drawTitle,
  drawWon,
  lcdOverlay,
} from "@/lib/draw";
import { H, W, newGame, start, step, type GameState } from "@/lib/game";
import { SITE, liveLinks, unfilled } from "@/lib/site";

const BOOT_MS = 2600;
const BEST_KEY = "treeclimb_best";

export default function Handheld() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);

  const [won, setWon] = useState(false);
  // Nobody should have to be good at a game to read why the page exists.
  const [revealed, setRevealed] = useState(false);
  const [sound, setSound] = useState(false);
  const [powered, setPowered] = useState(false);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});

  const game = useRef<GameState | null>(null);
  const input = useRef({ left: false, right: false });
  const bootAt = useRef(0);
  const buffer = useRef<HTMLCanvasElement | null>(null);
  const scale = useRef(3);
  /** Audio can only start inside a gesture, so the first one switches it on. */
  const touched = useRef(false);

  const mark = useCallback((key: string, on: boolean) => {
    setPressed((p) => (p[key] === on ? p : { ...p, [key]: on }));
  }, []);

  const firstGesture = useCallback(() => {
    if (touched.current) return;
    touched.current = true;
    unlock();
    setMuted(false);
    setSound(true);
    sfx.boot();
  }, []);

  /* --------------------------------- input -------------------------------- */

  const press = useCallback(
    (action: "left" | "right" | "start" | "a" | "b") => {
      firstGesture();
      const g = game.current;
      if (!g) return;

      if (action === "left") input.current.left = true;
      if (action === "right") input.current.right = true;

      if (action === "start" || action === "a" || action === "b") {
        if (g.phase === "title" || g.phase === "dead") {
          game.current = start(g);
          setWon(false);
          if (!isMuted()) sfx.select();
        } else if (g.phase === "won") {
          game.current = start(g);
          setWon(false);
          if (!isMuted()) sfx.select();
        }
      }
    },
    [firstGesture],
  );

  const release = useCallback((action: "left" | "right") => {
    input.current[action] = false;
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      let action: "left" | "right" | "start" | "a" | "b" | null = null;
      if (k === "arrowleft" || k === "a") action = "left";
      else if (k === "arrowright" || k === "d") action = "right";
      else if (k === "enter" || k === " ") action = "start";
      else if (k === "z" || k === "x") action = "a";
      if (!action) return;

      e.preventDefault();
      if (down) {
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
  }, [press, release, mark]);

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
    if (!g) return;
    buffer.current = buf;

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

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const s = game.current;
      if (!s) return;

      const booting = now - bootAt.current < BOOT_MS;
      if (booting) {
        drawBoot(g, (now - bootAt.current) / 1000);
      } else {
        if (!powered) setPowered(true);
        step(s, input.current, dt);

        for (const e of s.events) {
          if (isMuted()) continue;
          if (e === "jump") sfx.jump();
          else if (e === "break") sfx.breaking();
          else if (e === "leaf") sfx.leaf();
          else if (e === "die") sfx.die();
          else if (e === "win") sfx.win();
        }
        if (s.events.includes("win")) setWon(true);
        s.events.length = 0;

        if (s.best > savedBest) {
          savedBest = s.best;
          try {
            localStorage.setItem(BEST_KEY, String(s.best));
          } catch {
            /* ignore */
          }
        }

        if (s.phase === "title") drawTitle(g, s);
        else if (s.phase === "playing") drawGame(g, s);
        else if (s.phase === "dead") drawDead(g, s);
        else drawWon(g, s);
      }

      // blit the native buffer up to the panel, nearest-neighbour
      const k = scale.current;
      view.imageSmoothingEnabled = false;
      view.clearRect(0, 0, canvas.width, canvas.height);
      view.drawImage(buf, 0, 0, W * k, H * k);
      lcdOverlay(view, W * k, H * k, k);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // `powered` is only ever set true from inside the loop; re-subscribing on
    // it would restart the boot animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const tap = (action: "start" | "a" | "b") => ({
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
    if (next) sfx.select();
  };

  const links = liveLinks();

  /* -------------------------------- render -------------------------------- */

  return (
    <div className="room flex flex-col items-center gap-10 px-4 py-10 sm:py-14">
      <div className="scene">
        <div ref={deviceRef} className="device">
          {/* screen */}
          <div className="bezel">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`power-led ${powered ? "" : "off"}`} />
                <span className="label text-[#8d8f9a]">power</span>
              </div>
              <span className="label text-[#8d8f9a]">dot matrix</span>
            </div>
            <div className="lcd">
              <canvas ref={canvasRef} aria-label="Game screen" />
            </div>
          </div>

          <p className="pixel mt-4 text-center text-[11px] text-[#5e5b55]">
            {SITE.cartridge}
            <span className="text-[#8d8a84]"> ™</span>
          </p>

          {/* controls */}
          <div className="mt-6 flex items-start justify-between">
            <div className="dpad">
              <button
                className="dpad-hit left"
                aria-label="Move left"
                {...hold("left")}
              />
              <button
                className="dpad-hit right"
                aria-label="Move right"
                {...hold("right")}
              />
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
                <button className="pill-btn" aria-label="Select" {...tap("start")} />
                <span className="label text-[#6f6c66]">select</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button className="pill-btn" aria-label="Start" {...tap("start")} />
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
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <p className="label text-center text-dimmer">
            d-pad or ◀ ▶ to climb · start to begin
          </p>
          <button
            onClick={toggleSound}
            className="label rounded-full border border-white/10 px-3 py-1.5 text-dim transition-colors hover:text-text"
          >
            {sound ? "♪ sound on" : "sound off"}
          </button>
        </div>

        {!won && !revealed && (
          <div className="flex flex-col items-center gap-3">
            <p className="hint label text-dimmer">
              reach the top to see why this exists
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
          <div className="reveal w-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur">
            <p className="label mb-5 text-dimmer">
              {SITE.event.toLowerCase()} {SITE.year} · application
            </p>
            <h1
              className="pixel mb-5 text-lg leading-relaxed"
              style={{ fontFamily: "var(--font-pixel-face), monospace" }}
            >
              {SITE.name}
            </h1>
            <p
              className={`text-[15px] leading-relaxed ${
                unfilled(SITE.pitch)
                  ? "rounded bg-amber-400/15 px-2 py-1 text-amber-300"
                  : "text-dim"
              }`}
              title={unfilled(SITE.pitch) ? "Edit lib/site.ts to replace this" : undefined}
            >
              {SITE.pitch}
            </p>
            {links.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                {links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="label text-text underline decoration-white/25 underline-offset-4 hover:decoration-white"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
