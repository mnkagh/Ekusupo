import { useEffect, useRef } from "react";

import { runDecode } from "../visuals/decode-text.js";
import { hasFinePointer, prefersReducedMotion } from "../visuals/media.js";
export interface LandingProps {
  onAuth: (mode: "sign-in" | "sign-up") => void;
}

const WORD = "EKUSUPO";

/**
 * Option 3 — no panels at all. The name fills the screen in depth-staggered
 * letters that track the cursor, with a single entry point beneath.
 *
 * Distinct from the loading intro: that one decodes and clears, this one
 * is the page itself and stays. It is the only variant where the type is
 * the interface rather than a headline sitting above one.
 */
export function ImmersiveLanding({ onAuth }: LandingProps) {
  const rowRef = useRef<HTMLHeadingElement>(null);

  // The same decode the splash runs, so the mark resolves the same way
  // wherever it appears.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (prefersReducedMotion()) return;

    return runDecode(Array.from(row.querySelectorAll<HTMLElement>("[data-char]")), {
      firstSettleMs: 420,
      perLetterMs: 150,
    });
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (prefersReducedMotion() || !hasFinePointer()) return;

    const letters = Array.from(row.querySelectorAll<HTMLElement>("span"));
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;

    const animate = () => {
      x += (targetX - x) * 0.07;
      y += (targetY - y) * 0.07;
      letters.forEach((letter, index) => {
        // Alternating depth so the word has thickness rather than
        // sliding as one plane.
        const depth = 1 - (index % 3) * 0.32;
        letter.style.transform = `translate3d(${(x * 38 * depth).toFixed(2)}px, ${(y * 22 * depth).toFixed(2)}px, 0) rotateY(${(x * 22 * depth).toFixed(2)}deg) rotateX(${(-y * 15 * depth).toFixed(2)}deg)`;

        // The extrusion leans away from the cursor, so the side wall
        // appears on the face turning away from the viewer.
        letter.style.setProperty("--lean-x", (-x * 2.2 * depth).toFixed(3));
        letter.style.setProperty("--lean-y", (-y * 1.6 * depth).toFixed(3));
      });
      frame =
        Math.abs(targetX - x) < 0.001 && Math.abs(targetY - y) < 0.001
          ? 0
          : requestAnimationFrame(animate);
    };

    const handlePointer = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(animate);
    };

    window.addEventListener("pointermove", handlePointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointer);
    };
  }, []);

  return (
    <div className="immersive">
      <div className="immersive__stage">
        {/*
          The heading itself, not a decorative copy of it. Split into
          per-letter spans for the depth parallax, with an explicit
          `aria-label` so assistive tech reads "Ekusupo" rather than
          seven separate letters.
        */}
        <h1 className="immersive__word" ref={rowRef} aria-label="Ekusupo">
          {WORD.split("").map((character, index) => (
            <span
              key={`${character}-${index}`}
              aria-hidden="true"
              // Repeated as an attribute so CSS can draw a second,
              // blurred copy behind this one — the colour takes the
              // letter's own shape rather than ringing the whole word.
              data-char={character}
              style={{ "--i": index } as React.CSSProperties}
            >
              {character}
            </span>
          ))}
        </h1>
      </div>

      <p className="immersive__tagline">
        Move playlists between music services, and see exactly what carried over.
      </p>

      <div className="immersive__actions">
        <button
          type="button"
          className="btn btn--primary btn--auto"
          onClick={() => onAuth("sign-up")}
        >
          Create account
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => onAuth("sign-in")}>
          Sign in
        </button>
      </div>
    </div>
  );
}
