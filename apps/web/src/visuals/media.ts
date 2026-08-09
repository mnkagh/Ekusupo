/**
 * `matchMedia` guards.
 *
 * Not every environment that runs this code is a browser — jsdom under
 * test doesn't implement `matchMedia` at all, and calling it there
 * throws inside an effect, which React surfaces as a component crash.
 * Rather than special-casing tests, treat the API as optional: a missing
 * `matchMedia` means "no stated preference", which is the same answer a
 * browser gives when the user has set none.
 */
function query(mediaQuery: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(mediaQuery).matches;
}

export function prefersReducedMotion(): boolean {
  return query("(prefers-reduced-motion: reduce)");
}

/** False on touch-only devices, where a hover-driven effect has nothing to respond to. */
export function hasFinePointer(): boolean {
  return query("(hover: hover) and (pointer: fine)");
}
