import type { AuthSession } from "@ekusupo/connector-sdk";

import { browserApi } from "../shared/browser-api.js";

const KEY_PREFIX = "provider-session:";

function storageKey(provider: string): string {
  return `${KEY_PREFIX}${provider}`;
}

/**
 * Provider sessions, keyed by provider name.
 *
 * Backed by `chrome.storage.session`, not a module-scope `Map` — which is
 * what this was, and which quietly lost every connection. An MV3 service
 * worker is terminated after about thirty seconds of inactivity, taking
 * its module state with it: a user who connected Spotify, left the tab
 * alone, then clicked Transfer was told their account "isn't connected
 * yet" and had to run the whole OAuth flow again. `chrome.storage.session`
 * survives that restart, which is the same reason
 * `tab-transfer-status-store.ts` uses it (ADR-0015).
 *
 * **`session`, deliberately, not `local`.** `storage.session` lives in
 * memory and is cleared when the browser closes; `storage.local` would
 * write access and refresh tokens to disk in plaintext. Reconnecting once
 * per browser session is a smaller cost than tokens at rest that nothing
 * encrypts (CLAUDE.md §12.1). The extension holds tokens only because it
 * runs the Transfer Engine itself; when it talks to `services/api`
 * instead, they stop being its problem entirely.
 */
export class SessionStore {
  async get(provider: string): Promise<AuthSession | undefined> {
    const key = storageKey(provider);
    const stored = await browserApi.storage.session.get(key);
    return stored[key] as AuthSession | undefined;
  }

  async set(provider: string, session: AuthSession): Promise<void> {
    await browserApi.storage.session.set({ [storageKey(provider)]: session });
  }

  /** Used when a connection is revoked, so a stale token cannot be reused. */
  async clear(provider: string): Promise<void> {
    await browserApi.storage.session.remove(storageKey(provider));
  }
}
