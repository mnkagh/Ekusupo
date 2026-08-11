import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { CatalogProvider, StoredCredentialSummary } from "../api/providers-client.js";

/** Where someone goes to register the app whose credentials they are about to paste. */
const CONSOLE_URLS: Record<string, string> = {
  spotify: "https://developer.spotify.com/dashboard",
  "youtube-music": "https://console.cloud.google.com/apis/credentials",
  "apple-music": "https://developer.apple.com/account/resources/authkeys/list",
};

type Status =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Lets someone use **their own** provider application instead of the
 * deployment's.
 *
 * This is not a convenience. A Spotify app in development mode is capped
 * at 25 manually-listed users, and lifting that requires a quota review
 * of the deployment itself — so a single operator-owned app cannot serve
 * an open-source tool's users at all. Bringing your own app is what
 * makes this software something you can run rather than a service you
 * have to be let into.
 *
 * Secrets go one way. The server never returns a stored secret, so this
 * shows only that one exists and which app it belongs to; changing it
 * means replacing it.
 */
export function ProviderCredentials() {
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [stored, setStored] = useState<StoredCredentialSummary[]>([]);
  const [openFor, setOpenFor] = useState<string | undefined>();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const clientIdField = useId();
  const clientSecretField = useId();
  const redirectField = useId();

  const load = useCallback(() => {
    void providersClient
      .listCatalog()
      .then(({ providers }) => setCatalog(providers))
      .catch(() => setCatalog([]));
    void providersClient
      .listCredentials()
      .then(({ credentials }) => setStored(credentials))
      .catch(() => setStored([]));
  }, []);

  useEffect(load, [load]);

  const summaryFor = (provider: string) => stored.find((entry) => entry.provider === provider);

  const openEditor = (provider: string) => {
    setOpenFor(provider);
    setStatus({ kind: "idle" });
    setClientId("");
    setClientSecret("");
    // Prefilled with the value this deployment actually expects, because
    // it has to match the provider's dashboard character for character
    // and typing it by hand is the single most common way this fails.
    setRedirectUri(
      `${window.location.origin.replace(/:\d+$/, ":3000")}/providers/${provider}/callback`,
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>, provider: string) => {
    event.preventDefault();
    setStatus({ kind: "saving" });

    void providersClient
      .saveCredentials(provider, {
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
        ...(redirectUri ? { redirectUri } : {}),
      })
      .then(() => {
        setStatus({ kind: "saved" });
        setClientSecret("");
        load();
      })
      .catch((error: unknown) => {
        setStatus({
          kind: "error",
          message: error instanceof ApiError ? error.message : "Could not save those credentials.",
        });
      });
  };

  const remove = (provider: string) => {
    void providersClient
      .deleteCredentials(provider)
      .then(() => {
        setOpenFor(undefined);
        load();
      })
      .catch((error: unknown) => {
        setStatus({
          kind: "error",
          message:
            error instanceof ApiError ? error.message : "Could not remove those credentials.",
        });
      });
  };

  const oauthProviders = catalog.filter((provider) => provider.authKind === "oauth2");
  if (oauthProviders.length === 0) return null;

  return (
    <div className="credentials">
      <p className="transfer-form__hint">
        Use your own developer app instead of this server&apos;s. Your secret is encrypted before it
        is stored and is never sent back to the browser.
      </p>

      <ul className="credentials__list">
        {oauthProviders.map((provider) => {
          const summary = summaryFor(provider.id);
          const editing = openFor === provider.id;

          return (
            <li key={provider.id} className="credentials__item">
              <div className="credentials__row">
                <span className="credentials__name">{provider.displayName}</span>

                <span className="credentials__state">
                  {summary
                    ? `Your app · ${summary.clientIdPreview ?? "saved"}`
                    : provider.configured
                      ? "Using this server's app"
                      : "Not set up"}
                </span>

                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => (editing ? setOpenFor(undefined) : openEditor(provider.id))}
                >
                  {editing ? "Cancel" : summary ? "Replace" : "Use my own"}
                </button>
              </div>

              {editing && (
                <form
                  className="credentials__form"
                  onSubmit={(event) => submit(event, provider.id)}
                >
                  <p className="transfer-form__hint">
                    Register an app at{" "}
                    <a href={CONSOLE_URLS[provider.id]} target="_blank" rel="noreferrer noopener">
                      {provider.displayName}&apos;s developer console
                    </a>
                    , then paste its details here. The redirect URI below must be added to that app
                    exactly as shown.
                  </p>

                  <label className="field__label" htmlFor={`${clientIdField}-${provider.id}`}>
                    Client ID
                  </label>
                  <input
                    id={`${clientIdField}-${provider.id}`}
                    className="field__input"
                    value={clientId}
                    autoComplete="off"
                    onChange={(event) => setClientId(event.target.value)}
                  />

                  <label className="field__label" htmlFor={`${clientSecretField}-${provider.id}`}>
                    Client secret
                  </label>
                  <input
                    id={`${clientSecretField}-${provider.id}`}
                    className="field__input"
                    type="password"
                    autoComplete="off"
                    value={clientSecret}
                    onChange={(event) => setClientSecret(event.target.value)}
                  />

                  <label className="field__label" htmlFor={`${redirectField}-${provider.id}`}>
                    Redirect URI
                  </label>
                  <input
                    id={`${redirectField}-${provider.id}`}
                    className="field__input"
                    value={redirectUri}
                    onChange={(event) => setRedirectUri(event.target.value)}
                  />

                  <button
                    type="submit"
                    className="btn btn--connect"
                    disabled={status.kind === "saving" || !clientId || !clientSecret}
                  >
                    {status.kind === "saving" ? "Saving…" : "Save credentials"}
                  </button>

                  {summary && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => remove(provider.id)}
                    >
                      Remove my credentials
                    </button>
                  )}

                  {status.kind === "saved" && (
                    <p role="status" className="notice notice--ok">
                      Saved. Connect {provider.displayName} again to authorize with your app.
                    </p>
                  )}
                  {status.kind === "error" && (
                    <p role="alert" className="notice notice--error">
                      {status.message}
                    </p>
                  )}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
