import type { AuthSession } from "@ekusupo/connector-sdk";

/**
 * In-memory only, keyed by provider name. Nothing populates this yet — a
 * real `AuthenticateProvider` implementation needs an OAuth redirect flow
 * and somewhere safe to hold a client secret, neither of which exist yet
 * (see docs/browser-extension.md "Transfer integration"). Until then,
 * every lookup returns `undefined` and callers must treat that as "this
 * provider isn't connected," not as a bug.
 */
export class SessionStore {
  private readonly sessions = new Map<string, AuthSession>();

  get(provider: string): AuthSession | undefined {
    return this.sessions.get(provider);
  }

  set(provider: string, session: AuthSession): void {
    this.sessions.set(provider, session);
  }
}
