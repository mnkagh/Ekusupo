import { afterEach, describe, expect, it } from "vitest";

import { browserApi } from "./browser-api.js";

/**
 * Cast to a fresh shape rather than intersecting with `typeof globalThis`:
 * @types/chrome declares `chrome` as a non-optional global, so the
 * intersection would make it undeletable and force every fake to satisfy
 * the entire 70-member namespace. Same pattern the other extension test
 * files use.
 */
const globals = globalThis as { browser?: unknown; chrome?: unknown };

function fakeNamespace(label: string) {
  return { runtime: { id: label } };
}

afterEach(() => {
  delete globals.browser;
  delete globals.chrome;
});

describe("browserApi", () => {
  it("resolves the namespace at access time, not at import time", () => {
    // The import above already ran. Installing the namespace only now is
    // exactly what every other test file in this package does in its
    // beforeEach — an import-time capture would miss it entirely.
    globals.chrome = fakeNamespace("installed-late");

    expect(browserApi.runtime.id).toBe("installed-late");
  });

  it("prefers browser over chrome so Firefox gets the promise-style API", () => {
    // Firefox exposes both; its `chrome` alias is callback-style, and code
    // in this package awaits these calls directly.
    globals.browser = fakeNamespace("browser");
    globals.chrome = fakeNamespace("chrome");

    expect(browserApi.runtime.id).toBe("browser");
  });

  it("falls back to chrome where browser does not exist", () => {
    globals.chrome = fakeNamespace("chrome");

    expect(browserApi.runtime.id).toBe("chrome");
  });

  it("sees a namespace swapped out between accesses", () => {
    globals.chrome = fakeNamespace("first");
    expect(browserApi.runtime.id).toBe("first");

    globals.chrome = fakeNamespace("second");
    expect(browserApi.runtime.id).toBe("second");
  });

  it("throws a named error rather than a property-of-undefined crash", () => {
    expect(() => browserApi.runtime).toThrow(/No extension API available/);
  });

  it("reports membership against the live namespace", () => {
    globals.chrome = fakeNamespace("chrome");

    expect("runtime" in browserApi).toBe(true);
    expect("storage" in browserApi).toBe(false);
  });
});
