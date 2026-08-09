import { useEffect, useRef } from "react";

import { hasFinePointer, prefersReducedMotion } from "./media.js";

export interface TiltOptions {
  /** Peak rotation in degrees at the far edge of the element. */
  max?: number;
  /** How far the element lifts toward the viewer, in px. */
  lift?: number;
}

/**
 * Pointer-driven 3D tilt on a real CSS perspective transform.
 *
 * Written against the DOM node directly instead of through React state:
 * a pointermove handler that calls `setState` re-renders the subtree on
 * every mouse event, which is how tilt effects end up janky. This writes
 * a transform and a pair of custom properties, and React never sees it.
 *
 * The same values also drive a specular highlight in CSS, so the sheen
 * tracks the cursor as one coherent light source rather than as a second
 * unrelated effect.
 *
 * Disabled entirely under `prefers-reduced-motion`, and on coarse
 * pointers where there is no hover to respond to.
 */
export function useTilt<T extends HTMLElement>({ max = 6, lift = 6 }: TiltOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) return;
    if (!hasFinePointer()) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let active = false;

    const animate = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      const z = active ? lift : 0;
      node.style.transform = `perspective(900px) rotateX(${currentY.toFixed(3)}deg) rotateY(${currentX.toFixed(3)}deg) translateZ(${z}px)`;

      const settled = Math.abs(targetX - currentX) < 0.01 && Math.abs(targetY - currentY) < 0.01;
      if (settled && !active) {
        node.style.transform = "";
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(animate);
    };

    const ensureRunning = () => {
      if (!frame) frame = requestAnimationFrame(animate);
    };

    const handleMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      // -1..1 from the element's own centre, so tilt is relative to the
      // card rather than to the viewport.
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      targetX = px * max * 2;
      targetY = -py * max * 2;
      node.style.setProperty("--tilt-x", `${(px * 100 + 50).toFixed(2)}%`);
      node.style.setProperty("--tilt-y", `${(py * 100 + 50).toFixed(2)}%`);
      ensureRunning();
    };

    const handleEnter = () => {
      active = true;
      ensureRunning();
    };

    const handleLeave = () => {
      active = false;
      targetX = 0;
      targetY = 0;
      node.style.setProperty("--tilt-x", "50%");
      node.style.setProperty("--tilt-y", "50%");
      ensureRunning();
    };

    node.addEventListener("pointerenter", handleEnter);
    node.addEventListener("pointermove", handleMove, { passive: true });
    node.addEventListener("pointerleave", handleLeave);

    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointerenter", handleEnter);
      node.removeEventListener("pointermove", handleMove);
      node.removeEventListener("pointerleave", handleLeave);
    };
  }, [max, lift]);

  return ref;
}
