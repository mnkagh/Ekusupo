import { describe, expect, it } from "vitest";

import { outDirFor, targetFromEnv } from "./build-target.js";

describe("targetFromEnv", () => {
  it("defaults to chrome when unset", () => {
    expect(targetFromEnv(undefined)).toBe("chrome");
    expect(targetFromEnv("")).toBe("chrome");
  });

  it("accepts either target, case- and whitespace-insensitively", () => {
    expect(targetFromEnv("firefox")).toBe("firefox");
    expect(targetFromEnv("FireFox")).toBe("firefox");
    expect(targetFromEnv("  firefox  ")).toBe("firefox");
    expect(targetFromEnv("chrome")).toBe("chrome");
  });

  it("throws on an unrecognised value instead of falling back to chrome", () => {
    // Falling back would hand someone a Chrome build in a folder they
    // believed was Firefox's — it installs, then fails at runtime.
    expect(() => targetFromEnv("safari")).toThrow(/Unknown EKUSUPO_BROWSER "safari"/);
  });
});

describe("outDirFor", () => {
  it("keeps the two builds in separate folders", () => {
    expect(outDirFor("chrome")).toBe("dist");
    expect(outDirFor("firefox")).toBe("dist-firefox");
    expect(outDirFor("chrome")).not.toBe(outDirFor("firefox"));
  });
});
