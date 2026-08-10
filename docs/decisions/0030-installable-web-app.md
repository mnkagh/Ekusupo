# ADR-0030: The mobile app is the web app, installed

Status: Accepted

## Context

The dashboard needed to be usable on a phone and installable from a home
screen. "Mobile app" has two readings and they cost very differently:

1. A responsive, installable web app — one codebase, one deployment.
2. A store-listed native app — a second codebase (or a React
   Native/Capacitor shell), an Apple developer account, a Play Console
   account, review cycles, and a release process per store.

CLAUDE.md §2.3 places mobile apps in later scope, after the core is
stable. Building a native shell now would mean maintaining a second
client before the first one is finished, against §3.3's rule that clients
stay thin.

## Decision

**`apps/web` is a Progressive Web App.** A web manifest, a service
worker, and maskable icons, so it installs to a home screen on Android
and iOS and launches without browser chrome. Nothing else changes: it is
the same React app, the same routes, the same API.

**The layout is responsive down to 320px** and the app is usable at that
width — not merely non-overlapping. Touch targets, safe-area insets
(`viewport-fit=cover`), and `theme-color` are handled so it does not read
as a website in a frame.

**The service worker never caches API responses.** It caches the app
shell and static assets; navigations fall back to the cached shell when
offline; everything else is network-first, GET-only, same-origin only. A
cached playlist or transfer report is a stale answer presented as a
current one, which is worse than an error — and per CLAUDE.md §21, user
library data should not be sitting in a cache the user did not ask for.

**Icons have a source, not just a binary.**
`scripts/generate-icons.mjs` writes the PNG set from the mark's
definition in code (`pnpm --filter @ekusupo/web icons`). The outputs are
committed so a fresh clone builds a complete app without running Node
first, but the generator is the thing to edit — a reviewer can read the
diff that changed an icon instead of squinting at two PNGs.

## Consequences

- One codebase serves desktop, tablet, phone, and installed-app use.
- **This is not a store-listed native app.** It will not appear in the
  App Store or Play Store, it cannot use native-only APIs, and on iOS it
  inherits Safari's PWA limitations (no push without user gesture
  caveats, storage eviction under pressure). If a store listing is
  required later, this ADR is superseded, not extended.
- Offline support is limited by design: the shell loads, but any screen
  that needs the API shows an error rather than stale data.
- Service worker registration is gated on `import.meta.env.PROD`, so
  development never serves a stale bundle from cache.

## Alternatives Considered

- **Capacitor or React Native shell now.** Rejected as premature: a
  second client to maintain before the first is complete, for a
  distribution channel nobody has asked to publish to yet.
- **Caching API responses for offline browsing.** Rejected — see above;
  a stale transfer report is a correctness bug wearing a feature's
  clothes.
- **Committing the PNGs.** Rejected: binaries that cannot be reviewed
  and drift silently from the source mark.
