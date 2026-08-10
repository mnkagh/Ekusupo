# ADR-0031: The extension manifest is generated per browser target

Status: Accepted

## Context

The extension shipped a hand-written `public/manifest.json` for Chrome.
Supporting Firefox turned out not to be a matter of loading the same
folder in a second browser: under Manifest V3 the two browsers require
manifests that cannot both be satisfied by one document.

- Chrome requires `background.service_worker`. Firefox's MV3 does not
  implement extension service workers at all and requires
  `background.scripts` (an event page). Neither browser accepts the
  other's key.
- Firefox requires `browser_specific_settings.gecko.id` for a stable
  extension identity. Chrome rejects the key.

A separate hazard sits underneath this. Firefox exposes both `browser.*`
and a `chrome.*` alias, but the alias is the **callback-style** API while
`browser.*` is promise-style. This package awaits
`storage.local.get(...)` and `runtime.sendMessage(...)` directly, so on
Firefox the `chrome.*` alias resolves those awaits to `undefined` instead
of the stored value — a silent wrong answer, not a crash.

## Decision

**`src/manifest.ts` builds the manifest; the Vite config emits it.**
`buildManifest(target)` returns the document for `"chrome"` or
`"firefox"`, and a Rollup `generateBundle` hook writes it via
`this.emitFile`. `public/manifest.json` is deleted. One source of truth,
and the difference between the two browsers is a diff in one function
rather than two files that drift.

`manifest.test.ts` asserts the two documents are **structurally
identical once `background` and `browser_specific_settings` are
removed**, so a permission or content-script change cannot land in one
target and miss the other.

**Separate output folders: `dist/` for Chrome, `dist-firefox/` for
Firefox.** Same tree, two builds; one folder would mean the second build
silently overwrote the first.

**`targetFromEnv` throws on an unrecognised value** rather than falling
back to Chrome. A silent fallback hands someone a Chrome build in a
folder labelled Firefox — it installs, then fails at runtime, which is
the expensive way to find out.

**`scripts/build-targets.mjs` is a Node wrapper, not inline env-var
syntax.** `EKUSUPO_BROWSER=firefox vite build` is POSIX-shell-only and
does nothing on Windows, which would quietly produce exactly the
mislabelled build above. The wrapper spawns Vite's entry script under
`process.execPath` — no shell, so no `.cmd` shim problem — and locates it
by reading Vite's own `bin` field, because Vite 8 does not expose
`./bin/vite.js` through its `exports` map.

**`src/shared/browser-api.ts` is the one place a namespace is named**,
preferring `globalThis.browser` over `chrome`. It resolves the namespace
**lazily, per property access**, via a `Proxy` — an import-time capture
would freeze whatever existed at module-evaluation time, which is a real
ordering bug and not only a test-ergonomics concern.

**Safari is out of scope.** It needs Xcode, an Apple developer account,
and a native wrapper via `safari-web-extension-converter`; none of that
can be produced or verified from this repository.

## Consequences

- `pnpm build:all` produces loadable Chrome and Firefox builds from one
  codebase.
- Adding a permission or host means editing `manifest.ts` once, and the
  structural-equality test proves both targets received it.
- Apple Music and YouTube Music page detection ships alongside this, so
  the manifest's content-script matches and host permissions now cover
  all three providers.
- Two build folders to keep out of git, lint, and Prettier.
- **Firefox has not been verified against a live install.** The manifest
  is asserted by tests and the build output inspected, but loading it as
  a temporary add-on requires a browser this repository cannot drive.

## Alternatives Considered

- **Two hand-written manifest files.** Rejected: they drift, and the
  drift is invisible until a user reports that a feature works in one
  browser only.
- **One manifest with both background keys.** Rejected — Chrome fails
  validation on the Firefox keys and vice versa; there is no union
  document.
- **`webextension-polyfill`.** Reasonable, and a fair future choice, but
  it is a dependency to normalise exactly one difference this package
  touches in three files. The eleven-line `browser-api.ts` is the
  smaller thing to own.
- **`cross-env` for the build wrapper.** Rejected: a dependency to set
  one environment variable.
