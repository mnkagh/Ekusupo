import { useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { StoredCredentialSummary } from "../api/providers-client.js";

/** Where someone registers the app whose credentials they are about to paste. */
const CONSOLE_URLS: Record<string, string> = {
  spotify: "https://developer.spotify.com/dashboard",
  "youtube-music": "https://console.cloud.google.com/apis/credentials",
  "apple-music": "https://developer.apple.com/account/resources/authkeys/list",
};

export interface ProviderCredentialsFormProps {
  providerId: string;
  displayName: string;
  /** What is already stored, if anything. Never contains the secret. */
  summary?: StoredCredentialSummary;
  onChanged: () => void;
}

type Status =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Entering your own provider app, on the provider's own tile.
 *
 * It belongs here rather than in Settings because this is where someone
 * is already trying to connect that service — discovering that a
 * provider needs your own app, and then being sent somewhere else to
 * supply it, is two screens for one intention.
 *
 * It matters more than convenience: a Spotify app in development mode is
 * capped at 25 manually-listed users, so a single operator-owned app
 * cannot serve everyone. Bringing your own is what makes a provider
 * usable at all on a deployment that has no credentials of its own.
 *
 * Secrets travel one way. Nothing here ever receives a stored secret
 * back from the server — only a masked hint of which app it belongs to.
 */
export function ProviderCredentialsForm({
  providerId,
  displayName,
  summary,
  onChanged,
}: ProviderCredentialsFormProps) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const clientIdField = useId();
  const secretField = useId();
  const redirectField = useId();

  const openForm = () => {
    setOpen(true);
    setStatus({ kind: "idle" });
    setClientId("");
    setClientSecret("");
    // Prefilled, because it has to match the provider's dashboard
    // character for character and typing it by hand is the single most
    // common way this goes wrong. The API's own port, not the page's.
    setRedirectUri(
      `${window.location.origin.replace(/:\d+$/, ":3000")}/providers/${providerId}/callback`,
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ kind: "saving" });

    void providersClient
      .saveCredentials(providerId, { clientId, clientSecret, redirectUri })
      .then(() => {
        setStatus({ kind: "saved" });
        setClientSecret("");
        onChanged();
      })
      .catch((error: unknown) => {
        setStatus({
          kind: "error",
          message: error instanceof ApiError ? error.message : "Could not save those credentials.",
        });
      });
  };

  const remove = () => {
    void providersClient
      .deleteCredentials(providerId)
      .then(() => {
        setOpen(false);
        onChanged();
      })
      .catch((error: unknown) => {
        setStatus({
          kind: "error",
          message: error instanceof ApiError ? error.message : "Could not remove those.",
        });
      });
  };

  return (
    <div className="tile__credentials">
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => (open ? setOpen(false) : openForm())}
      >
        {open ? "Cancel" : summary ? "Replace my app" : "Use my own app"}
      </button>

      {summary && !open && (
        <span className="credentials__state">Your app · {summary.clientIdPreview ?? "saved"}</span>
      )}

      {open && (
        <form className="credentials__form" onSubmit={submit}>
          <p className="transfer-form__hint">
            Create an app in{" "}
            <a href={CONSOLE_URLS[providerId]} target="_blank" rel="noreferrer noopener">
              {displayName}&apos;s developer console
            </a>
            , add the redirect URI below to it exactly as shown, then paste its ID and secret here.
            The secret is encrypted before it is stored and never sent back to this page.
          </p>

          <label className="field__label" htmlFor={clientIdField}>
            Client ID
          </label>
          <input
            id={clientIdField}
            className="field__input"
            autoComplete="off"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />

          <label className="field__label" htmlFor={secretField}>
            Client secret
          </label>
          <input
            id={secretField}
            className="field__input"
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
          />

          <label className="field__label" htmlFor={redirectField}>
            Redirect URI
          </label>
          <input
            id={redirectField}
            className="field__input"
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
          />

          <button
            type="submit"
            className="btn btn--connect"
            disabled={status.kind === "saving" || !clientId || !clientSecret}
          >
            {status.kind === "saving" ? "Saving…" : "Save and enable"}
          </button>

          {summary && (
            <button type="button" className="btn btn--ghost btn--small" onClick={remove}>
              Remove my app
            </button>
          )}

          {status.kind === "saved" && (
            <p role="status" className="notice notice--ok">
              Saved. Now click Connect {displayName} to authorize with your app.
            </p>
          )}
          {status.kind === "error" && (
            <p role="alert" className="notice notice--error">
              {status.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
