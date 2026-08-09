import { useEffect, useState } from "react";

import { providersClient } from "../api/providers-client.js";
import type { ConnectedProvider } from "../api/providers-client.js";
import { useTilt } from "../visuals/useTilt.js";
import { PROVIDER_CATALOG } from "./provider-catalog.js";
import type { ProviderDescriptor } from "./provider-catalog.js";
import { ProviderGlyph } from "./ProviderGlyph.js";

type ListState = { status: "loading" } | { status: "loaded"; providers: ConnectedProvider[] };

function formatConnectedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface TileProps {
  descriptor: ProviderDescriptor;
  connection?: ConnectedProvider;
  disconnecting: boolean;
  onDisconnect: (provider: string) => void;
  index: number;
}

/**
 * One provider as a tile in a grid, not a row in a list.
 *
 * A row can only ever say "name … button". A tile has room to show the
 * thing that actually matters here — whether a live link exists — as a
 * state of the surface itself: the connected tile lights its own accent,
 * runs a signal along its top edge, and animates its glyph continuously,
 * while an unconnected one stays inert until hovered.
 */
function ProviderTile({ descriptor, connection, disconnecting, onDisconnect, index }: TileProps) {
  const tiltRef = useTilt<HTMLLIElement>({ max: 7, lift: 8 });
  const connected = Boolean(connection);
  const planned = descriptor.availability === "planned";

  return (
    <li
      ref={tiltRef}
      className={`tile ${connected ? "tile--live" : ""} ${planned ? "tile--planned" : ""}`}
      style={
        {
          "--accent-1": descriptor.accent[0],
          "--accent-2": descriptor.accent[1],
          "--delay": `${index * 90}ms`,
        } as React.CSSProperties
      }
    >
      {/* Name, then logo, then description — the mark sits between the
          heading and the detail rather than beside them. */}
      <h3 className="tile__name">{descriptor.name}</h3>

      <span className="tile__glyph">
        <ProviderGlyph glyph={descriptor.glyph} />
      </span>

      <p className="tile__capability">
        {connected && connection
          ? `Connected on ${formatConnectedAt(connection.connectedAt)}`
          : descriptor.capability}
      </p>

      <div className="tile__action">
        <span className={`status ${connected ? "status--live" : "status--idle"}`}>
          <span className="status__dot" aria-hidden="true" />
          {connected ? "Connected" : planned ? "Planned" : "Not connected"}
        </span>

        {planned ? (
          <span className="tile__pending">Not available yet</span>
        ) : connected ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onDisconnect(descriptor.id)}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <a className="btn btn--connect" href={providersClient.getSpotifyConnectUrl()}>
            Connect {descriptor.name}
          </a>
        )}
      </div>
    </li>
  );
}

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

  const handleDisconnect = (provider: string) => {
    setDisconnecting(provider);
    void providersClient.disconnectProvider(provider).then(() => {
      setDisconnecting(null);
      reload();
    });
  };

  const connections = state.status === "loaded" ? state.providers : [];
  const liveCount = connections.length;

  return (
    <section className="panel rise" style={{ "--delay": "80ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          {/* Not "Connected providers": the list covers every provider
              Ekusupo knows about, most of which aren't connected. */}
          <h2 className="section-title">Providers</h2>
          <span className="eyebrow">Sources and destinations</span>
        </div>
        <span className="counter">
          <span className="counter__value">{String(liveCount).padStart(2, "0")}</span>
          <span className="counter__label">connected</span>
        </span>
      </div>

      <div className="panel__body">
        {state.status === "loading" && (
          <p className="loading">
            <span className="loading__bar" aria-hidden="true" />
            Loading…
          </p>
        )}

        {state.status === "loaded" && (
          <ul className="tile-grid">
            {PROVIDER_CATALOG.map((descriptor, index) => (
              <ProviderTile
                key={descriptor.id}
                index={index}
                descriptor={descriptor}
                connection={connections.find((entry) => entry.provider === descriptor.id)}
                disconnecting={disconnecting === descriptor.id}
                onDisconnect={handleDisconnect}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
