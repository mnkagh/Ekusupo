/**
 * A Client ID is public by design (RFC 6749 §2.2 — it identifies the app,
 * it isn't a secret), so `chrome.storage.local` is appropriate: unlike
 * `background/tab-transfer-status-store.ts`'s deliberately session-scoped
 * job state, a Client ID is stable config the user sets once and should
 * survive a browser restart.
 */
const STORAGE_KEY = "spotify-client-id";

export async function getSpotifyClientId(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] as string | undefined;
}

export async function setSpotifyClientId(clientId: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: clientId });
}
