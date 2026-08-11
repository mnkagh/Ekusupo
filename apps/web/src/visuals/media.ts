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

/**
 * Calls `handler` whenever the system's light/dark preference flips.
 *
 * Guarded the same way as the queries above: where `matchMedia` is
 * missing there is no preference to change, so this subscribes to
 * nothing and returns a cleanup that does nothing, rather than throwing
 * inside an effect.
 */
export function onColorSchemeChange(handler: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}
