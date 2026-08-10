import type { BrowserTarget } from "./manifest.js";

/**
 * Build-time only — imported by the Vite configs, never by extension
 * code. Kept beside the manifest it selects so the two stay together.
 */

/**
 * Anything other than an exact "firefox" builds for Chrome. A typo
 * (`EKUSUPO_BROWSER=FireFox`) is accepted rather than silently producing
 * a Chrome build under a Firefox-shaped intent; anything genuinely
 * unrecognised throws instead of quietly building the wrong target.
 */
export function targetFromEnv(value: string | undefined): BrowserTarget {
  if (value === undefined || value === "") return "chrome";

  const normalized = value.trim().toLowerCase();
  if (normalized === "firefox") return "firefox";
  if (normalized === "chrome") return "chrome";

  throw new Error(
    `Unknown EKUSUPO_BROWSER "${value}" — expected "chrome" or "firefox". ` +
      `Refusing to guess, because the wrong manifest produces an extension that installs and then fails.`,
  );
}

/** Separate folders so both builds can exist side by side and be loaded unpacked. */
export function outDirFor(target: BrowserTarget): string {
  return target === "firefox" ? "dist-firefox" : "dist";
}
