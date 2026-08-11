import { useId, useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/errors.js";
import { providersClient } from "../api/providers-client.js";
import type { StoredCredentialSummary } from "../api/providers-client.js";

/** Where someone registers the app whose credentials they are about to paste. */
const CONSOLE_URLS: Record<string, string> = {
  spotify: "https://developer.spotify.com/dashboard",
  "youtube-music": "https://console.cloud.google.com/apis/credentials",
};

export interface ProviderCredentialsFormProps {
  providerId: string;
  displayName: string;
  /** What is already stored, if anything. Never contains the secret. */
  summary?: StoredCredentialSummary;
  /**
   * True when nothing else can make this provider work — the deployment
   * has no credentials for it. Then supplying your own app is the only
   * route, and presenting it as an "advanced" aside would hide the one
   * control that does anything.
   */
  required: boolean;
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
  required,
  onChanged,
}: ProviderCredentialsFormProps) {
  // Open from the start when there is no other way to enable the
  // provider — the form is the point of the tile at that moment.
  const [open, setOpen] = useState(required && !summary);
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
        // Cleared once exchanged for a stored, encrypted copy — there is
        // no reason to keep a secret sitting in a form field.
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
    <details className="tile__credentials" open={open}>
      {/*
        Collapsed, and labelled as advanced, because it is not the way
        most people should connect. The ordinary path is the Connect
        button above: it takes you to the provider's own login page,
        where you sign in with your usual account and approve — no
        developer app, no client id, nothing technical.
        This exists for two narrower cases: running your own copy of
        Ekusupo where nobody has configured that provider, and wanting
        your transfers to run against your own API quota rather than
        sharing this deployment's.
      */}
      <summary
        className={`tile__credentials-toggle${
          required && !summary ? " tile__credentials-toggle--required" : ""
        }`}
        onClick={(event) => {
          event.preventDefault();
          if (open) setOpen(false);
          else openForm();
        }}
      >
        {summary
          ? `Using your own app · ${summary.clientIdPreview ?? "saved"}`
          : required
            ? `Set up ${displayName} with your own app`
            : "Advanced: use your own developer app"}
      </summary>

      {open && (
        <form className="credentials__form" onSubmit={submit}>
          {!required && (
            <p className="transfer-form__hint">
              Most people should use <strong>Connect {displayName}</strong> above instead — it takes
              you to {displayName}&apos;s own sign-in page and needs nothing technical from you.
            </p>
          )}

          <p className="transfer-form__hint">
            {required
              ? `Nobody has set ${displayName} up on this server, so it needs an app of your own.`
              : "Only if you are running your own copy of Ekusupo, or want transfers to use your own API quota."}{" "}
            Create one in{" "}
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
    </details>
  );
}
