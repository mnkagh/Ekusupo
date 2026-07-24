# @ekusupo/extension

The Ekusupo browser extension (Chrome/Edge, Manifest V3). See
`docs/browser-extension.md` for architecture and `docs/decisions/0007-*`
for the build-tooling rationale.

## Status

This is the PR1 foundation only: the extension installs, the popup and
options pages render, the background service worker starts, and the
content script injects on Spotify pages. Nothing is functional yet — no
page detection, no injected UI, no transfers. See
`docs/browser-extension.md` for what later PRs add.

## Building

```sh
pnpm --filter @ekusupo/extension build
```

Runs two Vite passes (`vite.config.ts` for popup/options/background,
`vite.content.config.ts` for the content script) — both are required; see
ADR-0007 for why the content script can't share a build with the rest.
Output goes to `apps/extension/dist/`.

## Loading it in a browser

1. Run the build above.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable Developer mode.
4. Click "Load unpacked" and select `apps/extension/dist`.
5. The popup should open and show "Ekusupo". The background service
   worker should show as active in the extension's details page. Visiting
   `open.spotify.com` and opening the page's console should show
   `[Ekusupo] content script injected`.

No icons are set yet (no branding assets exist) — Chrome shows a default
icon for unpacked extensions in the meantime.
