import { useEffect, useRef } from "react";

import { Logo } from "../brand/Logo.js";
import { prefersReducedMotion } from "./media.js";

export interface BackdropProps {
  /** `dense` is the signed-in workspace: the mark sits back further so it never competes with the panels. */
  variant?: "calm" | "dense";
  /**
   * Which way to slide out from under an open drawer. The auth drawer
   * comes from the right, so the mark moves `left`; settings comes from
   * the left, so it moves `right`.
   */
  shift?: "none" | "left" | "right";
}

/**
 * The permanent backdrop: the brand mark, set enormous and glowing
 * behind every screen.
 *
 * On the landing it answers a click with a hard flash — and only a
 * click. It used to drift against the cursor as well, which meant the
 * mark was in near-constant motion behind a page someone was trying to
 * read, and made the deliberate response to a click harder to notice
 * rather than easier. One thing, on purpose, is louder than two.
 *
 * Entirely decorative: `aria-hidden`, `pointer-events: none`, and
 * unselectable.
 */
export function Backdrop({ variant = "calm", shift = "none" }: BackdropProps) {
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
     * during the first strike would do nothing. Done against the node
     * rather than through state so rapid clicks cost no re-renders.
     */
    const strike = () => {
      mark.classList.remove("backdrop__mark--flash");
      void mark.offsetWidth;
      mark.classList.add("backdrop__mark--flash");
    };

    const clearStrike = (event: AnimationEvent) => {
      // The mark carries a looping pulse too; only the strike is
      // meant to be one-shot.
      if (event.animationName === "backdrop-flash") {
        mark.classList.remove("backdrop__mark--flash");
      }
    };

    window.addEventListener("pointerdown", strike, { passive: true });
    mark.addEventListener("animationend", clearStrike);

    return () => {
      window.removeEventListener("pointerdown", strike);
      mark.removeEventListener("animationend", clearStrike);
      mark.classList.remove("backdrop__mark--flash");
    };
  }, [interactive]);

  return (
    <div className={`backdrop backdrop--${variant} backdrop--shift-${shift}`} aria-hidden="true">
      <div className="backdrop__mark" ref={markRef}>
        <Logo />
      </div>
      <div className="backdrop__scrim" />
    </div>
  );
}
