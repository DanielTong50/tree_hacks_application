"use client";

import { useEffect, useRef } from "react";
import { SITE } from "@/lib/site";

/**
 * The curtain before the console. Its one job is to make it impossible to
 * miss that this page is an application, and to over-commit to the bit.
 */

const TICKER = [
  "NOW WITH 100% MORE TREE",
  "CERTIFIED NOT A GOOGLE FORM",
  "CONTAINS ZERO (0) BLOCKCHAINS",
  "4 OUT OF 5 DENDROLOGISTS RECOMMEND",
  "ESTIMATED READING TIME: ONE (1) TREE",
  "SCIENTISTS BAFFLED",
  "THE BUTTONS ARE REAL. PRESS THEM.",
  "HAND-CRAFTED, FREE-RANGE PIXELS",
  "NO APPLICATIONS WERE HARMED IN THE MAKING OF THIS APPLICATION",
];

const CONFETTI_COLORS = ["#9bbc0f", "#ff4433", "#ffd23f", "#3ec1ff", "#c04a7e", "#e9e7e1"];

// Deterministic, so server and client render the same pile of confetti.
const CONFETTI = Array.from({ length: 42 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 0.53) % 6).toFixed(2),
  dur: (4.5 + ((i * 7) % 5)).toFixed(2),
  size: [6, 8, 10][i % 3],
  spin: i % 2 ? 1 : -1,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

export default function Welcome({
  leaving,
  onEnter,
}: {
  leaving: boolean;
  onEnter: () => void;
}) {
  const cta = useRef<HTMLButtonElement>(null);
  useEffect(() => cta.current?.focus({ preventScroll: true }), []);

  const seal = `${SITE.event.toUpperCase()} APPLICATION ★ NOT A DRILL ★ `;

  return (
    <div
      className={`welcome ${leaving ? "leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome — this is ${SITE.name}'s ${SITE.event} application`}
      onClick={onEnter}
    >
      <div className="welcome-rays" aria-hidden />
      <div className="welcome-scan" aria-hidden />
      <div className="welcome-confetti" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              background: c.color,
              animationDelay: `-${c.delay}s`,
              animationDuration: `${c.dur}s`,
              ["--spin" as string]: c.spin,
            }}
          />
        ))}
      </div>

      <div className="welcome-body">
        <p className="welcome-kicker label">
          <span className="blink">⚠</span> attention, {SITE.event.toLowerCase()} organizers{" "}
          <span className="blink">⚠</span>
        </p>

        <div className="welcome-headline-wrap">
          <h1 className="welcome-headline pixel">
            <span className="slam" style={{ animationDelay: "0.15s" }}>THIS</span>
            <span className="slam" style={{ animationDelay: "0.45s" }}>IS MY</span>
            <span className="slam" style={{ animationDelay: "0.8s" }}>
              <span className="mega">{SITE.event.toUpperCase()}</span>
            </span>
            <span className="slam" style={{ animationDelay: "1.25s" }}>APPLICATION</span>
          </h1>

          <svg className="welcome-seal" viewBox="0 0 120 120" aria-hidden>
            <defs>
              <path id="seal-ring" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
            </defs>
            <circle cx="60" cy="60" r="58" />
            <text>
              <textPath href="#seal-ring" textLength="286" lengthAdjust="spacing">
                {seal}
              </textPath>
            </text>
            <text x="60" y="58" textAnchor="middle" className="seal-big">
              {SITE.year}
            </text>
            <text x="60" y="74" textAnchor="middle" className="seal-small">
              ★ ★ ★
            </text>
          </svg>
        </div>

        <p className="welcome-sub fade-up" style={{ animationDelay: "1.7s" }}>
          Not a form. Not a PDF. Not a strongly worded essay about &ldquo;passion.&rdquo;
          <br />
          A <em>fully operational*</em> handheld game console, lovingly forged from
          TypeScript, Web Audio, and a frankly irresponsible amount of ambition.
        </p>

        <div className="welcome-stats fade-up" style={{ animationDelay: "2s" }}>
          <div>
            <b>~{SITE.volume}</b>
            <span>applications you will read</span>
          </div>
          <div>
            <b>1</b>
            <span>of them is a video game</span>
          </div>
          <div>
            <b>1</b>
            <span>tree (climbable)</span>
          </div>
        </div>

        <button
          ref={cta}
          className="welcome-cta pixel"
          onClick={(e) => {
            e.stopPropagation();
            onEnter();
          }}
        >
          ▶ PRESS START TO BEHOLD
        </button>

        <p className="welcome-fine fade-up" style={{ animationDelay: "2.6s" }}>
          applicant: {SITE.name} · sound will turn on · *operational in the sense that it
          turns on
        </p>
      </div>

      <div className="welcome-ticker" aria-hidden>
        <div className="welcome-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>
              {t} <i>✦</i>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
