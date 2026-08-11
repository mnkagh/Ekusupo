/** What the user asked for. `system` follows the OS setting as it changes. */
export type ThemePreference = "system" | "light" | "dark";

/** What is actually painted. `system` has already been resolved to one of these. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ekusupo:theme";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Reads the stored choice.
 *
 * Wrapped in try/catch because `localStorage` throws rather than
 * returning null when storage is blocked — Safari's private mode and a
 * "block third-party cookies" setting inside an iframe both do it. A
 * theme preference is not worth taking the page down for.
 */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Same reasoning as above: the theme still applies for this session.
  }
}

/** The OS setting, or `dark` where the question cannot be asked. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Writes the resolved theme onto the root element.
 *
 * `system` is resolved here rather than left to a `prefers-color-scheme`
 * block in CSS, so `data-theme` always holds the theme actually being
 * painted. That keeps one light palette in tokens.css instead of a
 * second copy inside a media query, and it means anything that needs to
 * know the current theme — the backdrop, a chart, a canvas — can read
 * one attribute instead of re-deriving it.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
}
