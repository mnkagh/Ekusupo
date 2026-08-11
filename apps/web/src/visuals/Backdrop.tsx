import { useEffect, useRef } from "react";

import { Logo } from "../brand/Logo.js";
import { hasFinePointer, prefersReducedMotion } from "./media.js";

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
 * On the landing it also answers the pointer, drifting a little against
 * the cursor so the mark sits behind the page rather than printed on it.
 * Only there: in the workspace the mark is deliberately receded, and
 * something that large moving behind a form someone is filling in is a
 * distraction rather than depth.
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
    if (prefersReducedMotion() || !hasFinePointer()) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;

    const animate = () => {
      // Eased rather than snapped: instant parallax reads as twitchy, and
      // this is meant to feel like something heavy sitting behind glass.
      x += (targetX - x) * 0.05;
      y += (targetY - y) * 0.05;

      // Custom properties rather than `transform`, because the drift
      // animation and the drawer shift already own `transform` and
      // `translate` respectively. Writing a third would mean one of the
      // three silently winning.
      mark.style.setProperty("--parallax-x", `${(x * 2.2).toFixed(2)}%`);
      mark.style.setProperty("--parallax-y", `${(y * 1.6).toFixed(2)}%`);

      frame =
        Math.abs(targetX - x) < 0.0005 && Math.abs(targetY - y) < 0.0005
          ? 0
          : requestAnimationFrame(animate);
    };

    const handlePointer = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(animate);
    };

    /**
     * Restarting a CSS animation needs the class gone, a reflow forced,
     * and the class back — without the reflow the browser coalesces the
     * remove and the add into no change at all, and a second click
     * during the first flash would do nothing. Done against the node
     * rather than through state for the same reason the parallax is:
     * this must survive rapid clicks without a re-render each time.
     */
    const flash = () => {
      mark.classList.remove("backdrop__mark--flash");
      void mark.offsetWidth;
      mark.classList.add("backdrop__mark--flash");
    };

    const clearFlash = (event: AnimationEvent) => {
      // The mark carries several looping animations; only the flash is
      // meant to be one-shot.
      if (event.animationName === "backdrop-flash") {
        mark.classList.remove("backdrop__mark--flash");
      }
    };

    window.addEventListener("pointermove", handlePointer, { passive: true });
    window.addEventListener("pointerdown", flash, { passive: true });
    mark.addEventListener("animationend", clearFlash);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerdown", flash);
      mark.removeEventListener("animationend", clearFlash);
      mark.classList.remove("backdrop__mark--flash");
      mark.style.removeProperty("--parallax-x");
      mark.style.removeProperty("--parallax-y");
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
