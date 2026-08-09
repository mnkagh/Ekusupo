import { useEffect, useState } from "react";

import { authClient } from "./api/auth-client.js";
import type { PublicUser } from "./api/auth-client.js";
import { AuthDrawer } from "./auth/AuthDrawer.js";
import { ImmersiveLanding } from "./landing/ImmersiveLanding.js";
import { ProvidersScreen } from "./providers/ProvidersScreen.js";
import { TransferScreen } from "./transfers/TransferScreen.js";
import { CoreField } from "./visuals/CoreField.js";
import { IntroScreen } from "./visuals/IntroScreen.js";

type AuthState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: PublicUser };

/**
 * The codes `provider-routes.ts` redirects back with, in plain language
 * (CLAUDE.md §8.3). Each says what to actually do about it — the raw
 * code is meaningless to a user, and "exchange_failed" in particular
 * points at credentials, so it must not be shown for a failure that
 * wasn't about credentials at all.
 */
const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined the permission request, so nothing was connected.",
  exchange_failed:
    "Spotify rejected the sign-in. Check the server's Spotify client ID, secret, and redirect URI.",
  storage_failed:
    "Spotify authorized successfully, but the connection could not be saved. The server is missing its token encryption key.",
};

interface RedirectMessage {
  tone: "ok" | "error";
  text: string;
}

/** Read once on mount from `?connected=spotify` / `?provider_error=...` — see ADR-0026. */
function readProviderRedirectMessage(search: string): RedirectMessage | null {
  const params = new URLSearchParams(search);
  const connected = params.get("connected");
  const error = params.get("provider_error");
  if (connected) return { tone: "ok", text: `Connected ${connected}.` };
  if (error) {
    return { tone: "error", text: PROVIDER_ERROR_MESSAGES[error] ?? `Could not connect: ${error}` };
  }
  return null;
}

/**
 * Everything past sign-in and connected providers — transfer setup and
 * every other CLAUDE.md §8.2 screen — is separate, later work
 * (ADR-0021, ADR-0023, ADR-0026 "What's deferred").
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [redirectMessage] = useState(() => readProviderRedirectMessage(window.location.search));
  const [authDrawer, setAuthDrawer] = useState<{ open: boolean; mode: "sign-in" | "sign-up" }>({
    open: false,
    mode: "sign-in",
  });

  const openAuth = (mode: "sign-in" | "sign-up") => setAuthDrawer({ open: true, mode });
  const closeAuth = () => setAuthDrawer((current) => ({ ...current, open: false }));

  useEffect(() => {
    void authClient.getMe().then((user) => {
      setAuth(user ? { status: "signed-in", user } : { status: "signed-out" });
    });

    if (readProviderRedirectMessage(window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    setAuth({ status: "signed-out" });
  };

  return (
    <>
      {/* A tighter, quicker field once signed in, so the workspace and
          the landing differ in texture rather than only in content. */}
      <CoreField
        variant={auth.status === "signed-in" ? "dense" : "calm"}
        respondToClick={auth.status !== "signed-in"}
      />
      <IntroScreen />

      {/*
        `shell--shifted` slides the page left while the auth drawer is
        open, so the centred wordmark moves out from behind the panel
        instead of sitting half-covered by it.
      */}
      <div className={`shell ${authDrawer.open ? "shell--shifted" : ""}`}>
        {/* Without the rail there is no first column to leave room for,
            so the landing spans the full width instead of sitting in a
            gap the missing sidebar used to occupy. */}
        <div className={`shell__inner ${auth.status === "signed-in" ? "" : "shell__inner--full"}`}>
          {/* Hidden while signed out: the landing already shows the name
              at full scale, and a second wordmark beside it is a
              duplicate of the page's own title. */}
          {auth.status === "signed-in" && (
            <aside className="rail rise">
              <div className="wordmark">
                <h1 className="wordmark__text">Ekusupo</h1>
                <p className="wordmark__description">
                  Move playlists between music services, and see exactly what carried over.
                </p>
              </div>

              <div className="session">
                <span className="session__identity">Signed in as {auth.user.email}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void handleSignOut()}
                >
                  Sign out
                </button>
              </div>
            </aside>
          )}

          <div className="content">
            {auth.status === "loading" && (
              <p className="loading">
                <span className="loading__bar" aria-hidden="true" />
                Establishing session
              </p>
            )}

            {auth.status === "signed-out" && (
              <div className="landing">
                <ImmersiveLanding onAuth={openAuth} />
              </div>
            )}

            {auth.status === "signed-in" && (
              <main className="workspace">
                {redirectMessage && (
                  <p
                    role="status"
                    className={`notice ${redirectMessage.tone === "ok" ? "notice--ok" : "notice--error"}`}
                  >
                    {redirectMessage.text}
                  </p>
                )}
                <TransferScreen />
                <ProvidersScreen />
              </main>
            )}
          </div>
        </div>
      </div>

      <AuthDrawer
        open={authDrawer.open}
        initialMode={authDrawer.mode}
        onClose={closeAuth}
        onSignedIn={(user) => {
          setAuthDrawer((current) => ({ ...current, open: false }));
          setAuth({ status: "signed-in", user });
        }}
      />
    </>
  );
}
