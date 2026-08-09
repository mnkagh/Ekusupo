import type { AuthSession } from "@ekusupo/connector-sdk";

/** Refresh this long before the token actually expires, so a request in flight can't outlive it. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Caches the app-level (Client Credentials) session used to read public
 * playlists when nobody is signed in.
 *
 * Spotify issues these for an hour, and they carry no user identity, so
 * one token serves every anonymous read the server does — fetching a
 * fresh one per request would burn rate limit for nothing.
 *
 * Concurrent callers share a single in-flight request rather than each
 * starting their own: the first caller stores the promise, everyone else
 * awaits it. Without that, a burst of requests on a cold cache would
 * each trigger a token exchange.
 */
export class AppSessionCache {
  private cached?: AuthSession;
  private inFlight?: Promise<AuthSession>;

  constructor(private readonly fetchSession: () => Promise<AuthSession>) {}

  async get(): Promise<AuthSession> {
    if (this.cached && !isExpiring(this.cached)) return this.cached;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.fetchSession()
      .then((session) => {
        this.cached = session;
        return session;
      })
      .finally(() => {
        // Cleared on failure too, so a transient error doesn't
        // permanently wedge every later caller onto a rejected promise.
        this.inFlight = undefined;
      });

    return this.inFlight;
  }
}

function isExpiring(session: AuthSession): boolean {
  if (!session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() - Date.now() <= EXPIRY_MARGIN_MS;
}
