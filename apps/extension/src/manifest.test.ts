import { describe, expect, it } from "vitest";

import { buildManifest, type BrowserTarget } from "./manifest.js";

const targets: BrowserTarget[] = ["chrome", "firefox"];

describe("buildManifest", () => {
  it.each(targets)("produces a valid MV3 core for %s", (target) => {
    const manifest = buildManifest(target);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Ekusupo");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("uses a service worker on Chrome and an event page on Firefox", () => {
    // The two browsers reject each other's key outright, which is the
    // entire reason this is generated instead of one static file.
    expect(buildManifest("chrome").background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
    expect(buildManifest("firefox").background).toEqual({
      scripts: ["background.js"],
      type: "module",
    });
  });

  it("declares a gecko id for Firefox only", () => {
    expect(buildManifest("firefox").browser_specific_settings).toEqual({
      gecko: { id: expect.any(String), strict_min_version: expect.any(String) },
    });
    // Chrome refuses to load a manifest carrying this key.
    expect(buildManifest("chrome")).not.toHaveProperty("browser_specific_settings");
  });

  it.each(targets)("grants %s host access to every provider it can talk to", (target) => {
    const hosts = buildManifest(target).host_permissions as string[];
    // A provider whose API host is missing fails at runtime with an
    // opaque network error, so this is asserted rather than assumed.
    expect(hosts).toContain("https://api.spotify.com/*");
    expect(hosts).toContain("https://api.music.apple.com/*");
    expect(hosts).toContain("https://www.googleapis.com/*");
  });

  it.each(targets)("injects the content script on every detected provider for %s", (target) => {
    const scripts = buildManifest(target).content_scripts as { matches: string[]; js: string[] }[];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.js).toEqual(["content.js"]);
    expect(scripts[0]?.matches).toEqual(
      expect.arrayContaining([
        "*://open.spotify.com/*",
        "*://music.apple.com/*",
        "*://music.youtube.com/*",
      ]),
    );
  });

  it.each(targets)("requests no permission beyond storage and identity on %s", (target) => {
    // Least privilege, CLAUDE.md §12.2 — a widened permission set should
    // require deliberately editing this expectation.
    expect(buildManifest(target).permissions).toEqual(["storage", "identity"]);
  });

  it("differs between targets only in background and gecko settings", () => {
    const chrome = { ...buildManifest("chrome") } as Record<string, unknown>;
    const firefox = { ...buildManifest("firefox") } as Record<string, unknown>;
    delete chrome.background;
    delete firefox.background;
    delete firefox.browser_specific_settings;
    expect(firefox).toEqual(chrome);
  });
});
