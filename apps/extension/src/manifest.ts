/**
 * The manifest, generated rather than hand-written, because Chrome and
 * Firefox need genuinely different Manifest V3 documents and two
 * hand-maintained copies would drift the first time a permission changed.
 *
 * The differences are not stylistic:
 *
 * - **Background.** Chrome MV3 requires `background.service_worker`.
 *   Firefox MV3 does not implement it and requires `background.scripts`
 *   with an event page. Neither browser accepts the other's key, so this
 *   cannot be one file with both.
 * - **Extension ID.** Firefox needs `browser_specific_settings.gecko.id`
 *   before it will install or sign a build; Chrome rejects the key.
 *
 * Chromium-family browsers (Edge, Brave, Opera, Vivaldi) load the Chrome
 * build unchanged. Safari is not covered: it needs Xcode's
 * `safari-web-extension-converter` and an Apple developer account, which
 * is a packaging step outside this build.
 */

export type BrowserTarget = "chrome" | "firefox";

/**
 * Hosts the extension reads. Each provider contributes exactly the pair
 * it needs — the web-facing host its resource pages live on, and the API
 * host the background context calls. Adding a provider means adding its
 * hosts here and a detector in content/detectors/, nothing else.
 */
const PROVIDER_HOSTS = [
  "https://api.spotify.com/*",
  "https://accounts.spotify.com/*",
  "https://api.music.apple.com/*",
  "https://www.googleapis.com/*",
  "https://oauth2.googleapis.com/*",
];

/** Pages where the action panel is injected — one per detector. */
const RESOURCE_PAGES = [
  "*://open.spotify.com/*",
  "*://music.apple.com/*",
  "*://music.youtube.com/*",
];

export function buildManifest(target: BrowserTarget): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: "Ekusupo",
    version: "0.1.0",
    description: "Move, sync, and back up your music library across providers.",
    action: {
      default_popup: "popup.html",
    },
    options_page: "options.html",
    background:
      target === "firefox"
        ? // Firefox event page: same entry file, loaded as a module script
          // rather than registered as a service worker.
          { scripts: ["background.js"], type: "module" }
        : { service_worker: "background.js", type: "module" },
    permissions: ["storage", "identity"],
    host_permissions: PROVIDER_HOSTS,
    content_scripts: [
      {
        matches: RESOURCE_PAGES,
        js: ["content.js"],
        run_at: "document_idle",
      },
    ],
    ...(target === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "ekusupo@ekusupo.app",
              // Below this, MV3 support is incomplete enough that the
              // extension would install and then misbehave.
              strict_min_version: "115.0",
            },
          },
        }
      : {}),
  };
}
