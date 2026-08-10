import type { AuthSession, MusicProvider } from "@ekusupo/connector-sdk";

import type { ProviderConnectionService } from "./provider-connection-service.js";

/**
 * Refresh this long before the token actually expires, so a transfer that
 * takes a while cannot outlive the credential it started with. Transfers
 * run in the background now (ADR-0033) and a large one is minutes of
 * work, which makes the margin load-bearing rather than decorative.
 */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

function isExpiring(session: AuthSession, now: number): boolean {
  if (!session.expiresAt) return false;
  const expiresAt = new Date(session.expiresAt).getTime();
  // An unparseable timestamp is treated as expiring: refreshing
  // needlessly costs one request, and *not* refreshing costs the user a
  // failed transfer and a confusing "authentication failed" message.
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt - now <= EXPIRY_MARGIN_MS;
}

export interface RefreshDeps {
  connectionService: ProviderConnectionService;
  now?: () => number;
}

/**
 * Returns a usable session for `providerId`, refreshing and re-storing it
 * first if it is at or near expiry.
 *
 * Nothing called `refreshAuthentication` before this existed, which meant
 * a Spotify connection worked for exactly one hour: come back the next
 * day and every transfer failed with "authentication failed or expired"
 * until the user disconnected and reconnected. The tokens and the
 * provider method were both already there — nothing joined them up.
 *
 * A refresh that fails is not fatal here. The stored session is returned
 * unchanged so the provider can reject it and the transfer report can say
 * so in its own words; turning a refresh failure into a route-level error
 * would replace a specific message with a vaguer one.
 */
export async function sessionWithRefresh(
  userId: string,
  providerId: string,
  provider: MusicProvider,
  deps: RefreshDeps,
): Promise<AuthSession | undefined> {
  const stored = await deps.connectionService.getSession(userId, providerId);
  if (!stored) return undefined;

  const now = deps.now?.() ?? Date.now();
  if (!isExpiring(stored, now)) return stored;

  try {
    const refreshed = await provider.refreshAuthentication(stored);
    // Persisted, not just used: without this every request refreshes
    // again, burning the provider's rate limit and — on providers that
    // rotate refresh tokens — eventually invalidating the connection.
    await deps.connectionService.saveSession(userId, providerId, refreshed);
    return refreshed;
  } catch (error) {
    console.warn(`[Ekusupo API] could not refresh the ${providerId} session`, error);
    return stored;
  }
}
