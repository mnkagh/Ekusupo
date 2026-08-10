/**
 * The one place the extension names a browser namespace.
 *
 * Chrome, Edge, Opera and Brave expose `chrome.*`. Firefox exposes
 * `browser.*` and *also* a `chrome.*` alias — but the alias is the
 * callback-style API, while `browser.*` is the promise-style one. Code
 * here awaits `storage.local.get(...)` and `runtime.sendMessage(...)`
 * directly, so on Firefox it must go through `browser.*` or those awaits
 * resolve to `undefined` instead of the stored value: a silent wrong
 * answer rather than a crash, which is the worst kind.
 *
 * `globalThis.browser` first, `chrome` second. Typed as Chrome's shape
 * because @types/chrome is what the repo already has and the two are
 * structurally compatible for everything used here; the difference is
 * promises-vs-callbacks at runtime, not the shape of the API surface.
 */
type BrowserNamespace = typeof chrome;

interface GlobalWithBrowser {
  browser?: BrowserNamespace;
  chrome?: BrowserNamespace;
}

function resolveNamespace(): BrowserNamespace {
  const globals = globalThis as typeof globalThis & GlobalWithBrowser;
  const namespace = globals.browser ?? globals.chrome;

  if (!namespace) {
    throw new Error(
      "No extension API available: neither globalThis.browser nor globalThis.chrome is defined. " +
        "This module only works inside an extension context.",
    );
  }
  return namespace;
}

/**
 * Resolution is deferred to each property access rather than done once at
 * module evaluation. Two reasons, one of them a real runtime bug and not
 * just a test-ergonomics concern:
 *
 * 1. Import order. A module that imports this one may be evaluated before
 *    the namespace exists on `globalThis` — capturing at import time would
 *    freeze in whatever was there at that instant, which may be nothing.
 * 2. Tests install a fake `globalThis.chrome` in `beforeEach` and delete
 *    it in `afterEach`, both of which happen long after the module graph
 *    is evaluated. A captured reference would ignore the fake entirely and
 *    keep a stale one alive across test files.
 *
 * The trap returns the real sub-namespace object (`storage`, `runtime`,
 * `tabs`), so every call below the first hop runs against the genuine API
 * with its own `this` intact.
 */
export const browserApi: BrowserNamespace = new Proxy({} as BrowserNamespace, {
  get(_target, property) {
    // Deliberately not forwarding the receiver: that would run any getter
    // on the namespace with `this` bound to this proxy, and the getter
    // would re-enter the trap for every property it touched.
    const namespace = resolveNamespace();
    return Reflect.get(namespace, property, namespace) as unknown;
  },
  has(_target, property) {
    return Reflect.has(resolveNamespace(), property);
  },
});
