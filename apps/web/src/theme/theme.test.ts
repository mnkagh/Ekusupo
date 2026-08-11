// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemTheme,
  THEME_STORAGE_KEY,
} from "./theme.js";

afterEach(() => {
  // Unstub *before* touching storage: the blocked-storage test replaces
  // `localStorage` with an object that throws on every call, so clearing
  // first throws out of teardown and leaves the stub in place for every
  // test after it.
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/** jsdom has no `matchMedia`, so a test that needs one installs it. */
function stubSystemPrefersLight(light: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: light, media: query })),
  );
}

describe("readStoredPreference", () => {
  it("defaults to following the system", () => {
    expect(readStoredPreference()).toBe("system");
  });

  it("reads back a stored choice", () => {
    storePreference("light");
    expect(readStoredPreference()).toBe("light");
  });

  it("ignores a stored value that is not a preference", () => {
    // Someone else's key collision, or a value from a future version —
    // either way, fall back rather than putting garbage on the root
    // element.
    localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readStoredPreference()).toBe("system");
  });

  it("survives storage being unavailable", () => {
    // Safari private mode and a blocked-cookies iframe both throw here
    // rather than returning null. A theme preference must not be able to
    // take the page down.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readStoredPreference()).toBe("system");
    expect(() => storePreference("dark")).not.toThrow();
  });
});

describe("storePreference", () => {
  it("clears the key when following the system again, rather than storing 'system'", () => {
    storePreference("dark");
    storePreference("system");

    // Absence *is* "system" — the inline script in index.html reads this
    // same key and treats a missing value that way.
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("returns an explicit choice unchanged, whatever the system says", () => {
    stubSystemPrefersLight(true);
    expect(resolveTheme("dark")).toBe("dark");

    stubSystemPrefersLight(false);
    expect(resolveTheme("light")).toBe("light");
  });

  it.each([
    [true, "light"],
    [false, "dark"],
  ])("follows the system when asked to (prefers light: %s)", (light, expected) => {
    stubSystemPrefersLight(light);
    expect(resolveTheme("system")).toBe(expected);
  });

  it("falls back to dark where the system cannot be asked", () => {
    // jsdom, a server render, an old browser — all reach this path.
    expect(systemTheme()).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("writes the resolved theme onto the root element", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
