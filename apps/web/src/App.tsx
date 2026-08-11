import { useEffect, useState } from "react";

import { authClient } from "./api/auth-client.js";
import { Logo } from "./brand/Logo.js";
import type { PublicUser } from "./api/auth-client.js";
import { AuthDrawer } from "./auth/AuthDrawer.js";
import { ImmersiveLanding } from "./landing/ImmersiveLanding.js";
import { ProvidersScreen } from "./providers/ProvidersScreen.js";
import { SettingsDrawer } from "./settings/SettingsDrawer.js";
import { SettingsIcon } from "./ui/icons.js";
import { PasteTracklist } from "./transfers/PasteTracklist.js";
import { TransferScreen } from "./transfers/TransferScreen.js";
import { UpfScreen } from "./transfers/UpfScreen.js";
import { Backdrop } from "./visuals/Backdrop.js";
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
 * One page rather than a router, because every CLAUDE.md §8.2 screen the
 * MVP needs — transfer setup and report, connected providers, UPF files,
 * account settings — is a panel someone scrolls to, not a place to
 * navigate to. Adding routing would buy deep links to four panels and
 * cost a dependency plus a navigation model; revisit when there is a
 * screen that genuinely cannot be a panel.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [redirectMessage] = useState(() => readProviderRedirectMessage(window.location.search));
  const [authDrawer, setAuthDrawer] = useState<{ open: boolean; mode: "sign-in" | "sign-up" }>({
    open: false,
    mode: "sign-in",
  });
  /*
   * Bumped to replay the intro. `IntroScreen` unmounts itself once it has
   * finished, so it cannot be re-triggered by a prop — changing its
   * `key` mounts a fresh one, which is the whole mechanism.
   *
   * Signing in is the moment the workspace appears, and it deserves the
   * same curtain the first load gets: the splash covers the switch from
   * the landing to the workspace instead of the two swapping in a single
   * frame.
   */
  const [introRun, setIntroRun] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      {/* Set back further once signed in, so the workspace panels have
          the foreground and the landing keeps the mark at full presence.
          `shift` slides it clear of whichever drawer is open, so the mark
          stays centred in the space actually left visible rather than
          sitting half-covered. */}
      <Backdrop
        variant={auth.status === "signed-in" ? "dense" : "calm"}
        shift={authDrawer.open ? "left" : settingsOpen ? "right" : "none"}
      />
      <IntroScreen key={introRun} />

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
                {/* Decorative: the heading beside it already says the
                    name, so the mark is not announced a second time. */}
                <Logo size={26} className="wordmark__logo" />
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

                {/* Below sign-out, and quieter than it: this is the way
                    into preferences, not an action on the session. */}
                <button
                  type="button"
                  className="btn btn--ghost btn--with-glyph"
                  onClick={() => setSettingsOpen(true)}
                >
                  <SettingsIcon size={15} />
                  Settings
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
                <PasteTracklist />
                <ProvidersScreen />
                <UpfScreen />
              </main>
            )}
          </div>
        </div>
      </div>

      {auth.status === "signed-in" && (
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={auth.user}
          onDeleted={() => {
            setSettingsOpen(false);
            setAuth({ status: "signed-out" });
          }}
        />
      )}

      <AuthDrawer
        open={authDrawer.open}
        initialMode={authDrawer.mode}
        onClose={closeAuth}
        onSignedIn={(user) => {
          setAuthDrawer((current) => ({ ...current, open: false }));
          setAuth({ status: "signed-in", user });
          setIntroRun((run) => run + 1);
        }}
      />
    </>
  );
}
