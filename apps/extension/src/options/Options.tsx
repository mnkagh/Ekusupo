import { useEffect, useState } from "react";

import { sendToBackground } from "../shared/message-bus.js";
import { getSpotifyClientId, setSpotifyClientId } from "./client-id-store.js";
import { connectSpotify } from "./spotify-connect.js";

type ConnectionStatus = "idle" | "connecting" | "connected" | "failed";

/**
 * Options owns the one thing background can't: starting the PKCE
 * redirect (`chrome.identity.launchWebAuthFlow` needs a full extension
 * page, not the service worker). See ADR-0020.
 */
export function Options() {
  const [clientId, setClientId] = useState("");
  // A synchronous, deterministic platform call — a lazy initializer, not
  // an effect, since there's no external event to subscribe to.
  const [redirectUri] = useState(() => chrome.identity.getRedirectURL());
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  useEffect(() => {
    void getSpotifyClientId().then((stored) => {
      if (stored) setClientId(stored);
    });
  }, []);

  const handleConnect = async () => {
    if (!clientId) return;
    setStatus("connecting");
    await setSpotifyClientId(clientId);

    const connected = await connectSpotify(clientId, {
      launchWebAuthFlow: (details) =>
        new Promise((resolve) => chrome.identity.launchWebAuthFlow(details, resolve)),
      getRedirectURL: () => chrome.identity.getRedirectURL(),
      authenticate: sendToBackground,
    });

    setStatus(connected ? "connected" : "failed");
  };

  return (
    <main>
      <h1>Ekusupo Settings</h1>
      <section>
        <h2>Spotify</h2>
        <p>
          Paste your own Spotify Developer app&apos;s Client ID to connect your account. Register
          one at{" "}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com/dashboard
          </a>
          , with redirect URI <code>{redirectUri}</code>.
        </p>
        <input
          type="text"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="Spotify Client ID"
          aria-label="Spotify Client ID"
        />
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={!clientId || status === "connecting"}
        >
          {status === "connecting" ? "Connecting…" : "Connect Spotify"}
        </button>
        {status === "connected" && <p role="status">Connected.</p>}
        {status === "failed" && (
          <p role="alert">Could not connect — check your Client ID and try again.</p>
        )}
      </section>
    </main>
  );
}
