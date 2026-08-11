import { useEffect, useState } from "react";

import { providersClient } from "../api/providers-client.js";
import type {
  CatalogProvider,
  ConnectedProvider,
  StoredCredentialSummary,
} from "../api/providers-client.js";
import { useTilt } from "../visuals/useTilt.js";
import { PROVIDER_CATALOG } from "./provider-catalog.js";
import type { ProviderDescriptor } from "./provider-catalog.js";
import { ProviderCredentialsForm } from "./ProviderCredentialsForm.js";
import { ProviderGlyph } from "./ProviderGlyph.js";

type ListState =
  | { status: "loading" }
  | {
      status: "loaded";
      providers: ConnectedProvider[];
      catalog: CatalogProvider[];
      credentials: StoredCredentialSummary[];
    };

function formatConnectedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface TileProps {
  descriptor: ProviderDescriptor;
  /** What the server reports for this provider; absent means it isn't in the registry. */
  catalogEntry?: CatalogProvider;
  connection?: ConnectedProvider;
  /** The caller's own app for this provider, if they have stored one. */
  credentialSummary?: StoredCredentialSummary;
  disconnecting: boolean;
  onDisconnect: (provider: string) => void;
  onCredentialsChanged: () => void;
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
function ProviderTile({
  descriptor,
  catalogEntry,
  connection,
  credentialSummary,
  disconnecting,
  onDisconnect,
  onCredentialsChanged,
  index,
}: TileProps) {
  const tiltRef = useTilt<HTMLLIElement>({ max: 7, lift: 8 });
  const connected = Boolean(connection);
  // "Can this actually be connected" is the server's answer, not ours —
  // it depends on which credentials the operator configured.
  const connectable = catalogEntry?.configured ?? false;

  return (
    <li
      ref={tiltRef}
      className={`tile ${connected ? "tile--live" : ""} ${connectable ? "" : "tile--planned"}`}
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
          : connectable
            ? descriptor.capability
            : // Says what the reader can actually do about it. Naming
              // server environment variables, as this once did, is
              // useless to someone who is not the operator.
              `Not set up on this server — add your own ${descriptor.name} app below to enable it.`}
      </p>

      <div className="tile__action">
        <span className={`status ${connected ? "status--live" : "status--idle"}`}>
          <span className="status__dot" aria-hidden="true" />
          {connected ? "Connected" : connectable ? "Not connected" : "Unavailable"}
        </span>

        {connected ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onDisconnect(descriptor.id)}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : connectable ? (
          <a className="btn btn--connect" href={providersClient.getConnectUrl(descriptor.id)}>
            Connect {descriptor.name}
          </a>
        ) : (
          <span className="tile__pending">Needs an app</span>
        )}
      </div>

      {/* Every provider in the registry, including Apple Music — it
          takes a signed developer token rather than a client id and
          secret, but that is still something a user can paste, and
          leaving it out meant a tile with no way to enable it at all. */}
      {catalogEntry && (
        <ProviderCredentialsForm
          providerId={descriptor.id}
          displayName={descriptor.name}
          summary={credentialSummary}
          required={!connectable}
          onChanged={onCredentialsChanged}
        />
      )}
    </li>
  );
}

/**
 * Each "Connect" control is a plain link, not a button with a click
 * handler — /providers/:provider/connect is a real server-side redirect
 * the browser must navigate to, not something to call from JS. See
 * ADR-0026.
 *
 * Which providers are connectable comes from the server rather than from
 * this file: only the server knows which credentials it holds.
 */
export function ProvidersScreen() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const reload = () => {
    // Three in one pass: the catalog says what is connectable, the
    // connection list says what already is, and the credential
    // summaries say which of those are usable because of the user's own
    // app rather than the server's.
    void Promise.all([
      providersClient.listProviders(),
      providersClient.listCatalog(),
      providersClient.listCredentials(),
    ])
      .then(([{ providers }, { providers: catalog }, { credentials }]) => {
        setState({ status: "loaded", providers, catalog, credentials });
      })
      .catch(() => setState({ status: "loaded", providers: [], catalog: [], credentials: [] }));
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
  const catalog = state.status === "loaded" ? state.catalog : [];
  const credentials = state.status === "loaded" ? state.credentials : [];
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
                catalogEntry={catalog.find((entry) => entry.id === descriptor.id)}
                connection={connections.find((entry) => entry.provider === descriptor.id)}
                credentialSummary={credentials.find((entry) => entry.provider === descriptor.id)}
                disconnecting={disconnecting === descriptor.id}
                onDisconnect={handleDisconnect}
                onCredentialsChanged={reload}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
