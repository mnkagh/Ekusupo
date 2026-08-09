import { useEffect, useRef, useState } from "react";

import { runDecode } from "./decode-text.js";
import { prefersReducedMotion } from "./media.js";

const WORD = "EKUSUPO";

const FIRST_SETTLE_MS = 500;
const PER_LETTER_MS = 190;
/** How long the finished word holds before the screen opens. */
const HOLD_MS = 700;
/** Must match the curtain transition in global.css. */
const EXIT_MS = 1100;

type Phase = "decoding" | "holding" | "exiting" | "done";

/**
 * A full, opaque intro screen — not a translucent layer over the app.
 *
 * It covers the viewport completely while it plays, so nothing shows
 * through and nothing behind it is visible half-finished. The name
 * decodes out of scrambled glyphs, holds, and then the screen splits
 * horizontally and the two solid halves slide apart, revealing the
 * interface behind them. After that it unmounts, leaving the rotating
 * core (`CoreField`) as the permanent backdrop.
 *
 * Skipped entirely under `prefers-reduced-motion`: an intro is pure
 * motion, so there is nothing to preserve when motion is unwanted, and
 * a splash that cannot animate is just a delay.
 */
export function IntroScreen() {
  const wordRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? "done" : "decoding"));

  useEffect(() => {
    if (phase !== "decoding") return;
    const root = wordRef.current;
    if (!root) return;

    const letters = Array.from(root.querySelectorAll<HTMLElement>("[data-char]"));
    return runDecode(letters, {
      firstSettleMs: FIRST_SETTLE_MS,
      perLetterMs: PER_LETTER_MS,
      markLocking: true,
      onSettled: () => setPhase("holding"),
    });
  }, [phase]);

  useEffect(() => {
    if (phase === "holding") {
      const timer = setTimeout(() => setPhase("exiting"), HOLD_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "exiting") {
      const timer = setTimeout(() => setPhase("done"), EXIT_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase]);

  // Unmounted rather than hidden: a finished splash has nothing to keep,
  // and a full-screen fixed layer still costs the compositor even when
  // fully transparent.
  if (phase === "done") return null;

  return (
    <div className={`intro ${phase === "exiting" ? "intro--exiting" : ""}`} aria-hidden="true">
      {/* Two solid halves that slide apart — the curtain. */}
      <div className="intro__curtain intro__curtain--top" />
      <div className="intro__curtain intro__curtain--bottom" />

      {/* The seam the halves part along. */}
      <div className="intro__seam" />

      <div className="intro__word" ref={wordRef}>
        {WORD.split("").map((character, index) => (
          <span
            // Fixed word, fixed order — index is a stable identity here.
            key={`${character}-${index}`}
            className="intro__letter"
            data-char={character}
            style={{ "--i": index } as React.CSSProperties}
          >
            {character}
          </span>
        ))}
      </div>
    </div>
  );
}
