import { useEffect, useState } from "react";

import { providersClient } from "../api/providers-client.js";
import type { ConnectedProvider } from "../api/providers-client.js";

type ListState = { status: "loading" } | { status: "loaded"; providers: ConnectedProvider[] };

/**
 * The Spotify "Connect" control is a plain link, not a button with a
 * click handler — `/providers/spotify/connect` is a real server-side
 * redirect the browser needs to navigate to, not something to call from
 * JS. See ADR-0026.
 */
export function ProvidersScreen() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const reload = () => {
    void providersClient.listProviders().then(({ providers }) => {
      setState({ status: "loaded", providers });
    });
  };

  useEffect(reload, []);

  const handleDisconnect = async (provider: string) => {
    setDisconnecting(provider);
    await providersClient.disconnectProvider(provider);
    setDisconnecting(null);
    reload();
  };

  const isSpotifyConnected =
    state.status === "loaded" && state.providers.some((p) => p.provider === "spotify");

  return (
    <section>
      <h2>Connected providers</h2>

      {state.status === "loading" && <p>Loading…</p>}

      {state.status === "loaded" && (
        <ul>
          <li>
            Spotify —{" "}
            {isSpotifyConnected ? (
              <>
                <span>Connected</span>{" "}
                <button
                  type="button"
                  onClick={() => void handleDisconnect("spotify")}
                  disabled={disconnecting === "spotify"}
                >
                  {disconnecting === "spotify" ? "Disconnecting…" : "Disconnect"}
                </button>
              </>
            ) : (
              <a href={providersClient.getSpotifyConnectUrl()}>Connect Spotify</a>
            )}
          </li>
        </ul>
      )}
    </section>
  );
}
