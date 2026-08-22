import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "./media.js";
import { BackdropMark } from "./BackdropMark.js";

export interface BackdropProps {
  /** `dense` is the signed-in workspace: the mark sits back further so it never competes with the panels. */
  variant?: "calm" | "dense";
}

/**
 * The permanent backdrop: the brand mark, set enormous behind every
 * screen.
 *
 * On the landing it answers a click with a **signal ping** — two thin
 * rings travelling out from the mark while its glow briefly lifts — and
 * only a click. It used to answer with a lightning flicker, which read
 * as alarm rather than recognition, and it used to drift against the
 * cursor besides, which meant the mark was in near-constant motion
 * behind a page someone was trying to read. One quiet response, on
 * purpose, beats two loud ones.
 *
 * Entirely decorative: `aria-hidden`, `pointer-events: none`, and
 * unselectable.
 */
export function Backdrop({ variant = "calm" }: BackdropProps) {
  const markRef = useRef<HTMLDivElement>(null);
  const interactive = variant === "calm";

  useEffect(() => {
    const mark = markRef.current;
    if (!mark) return;
    if (!interactive) return;
    if (prefersReducedMotion()) return;

    /**
     * Restarting a CSS animation needs the class gone, a reflow forced,
     * and the class back — without the reflow the browser coalesces the
     * remove and the add into no change at all, and a second click
     * during the first ping would do nothing. Done against the node
     * rather than through state so rapid clicks cost no re-renders.
     */
    const ping = () => {
      mark.classList.remove("backdrop__mark--ping");
      void mark.offsetWidth;
      mark.classList.add("backdrop__mark--ping");
    };

    const clearPing = (event: AnimationEvent) => {
      // The mark carries a looping pulse too; only the ping family is
      // meant to be one-shot.
      if (event.animationName.startsWith("ping-")) {
        mark.classList.remove("backdrop__mark--ping");
      }
    };

    window.addEventListener("pointerdown", ping, { passive: true });
    mark.addEventListener("animationend", clearPing);

    return () => {
      window.removeEventListener("pointerdown", ping);
      mark.removeEventListener("animationend", clearPing);
      mark.classList.remove("backdrop__mark--ping");
    };
  }, [interactive]);

  return (
    <div className={`backdrop backdrop--${variant}`} aria-hidden="true">
      <div className="backdrop__mark" ref={markRef}>
        <BackdropMark />
      </div>
      <div className="backdrop__scrim" />
    </div>
  );
}
