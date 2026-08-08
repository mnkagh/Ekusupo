import { useEffect, useState } from "react";

import { authClient } from "./api/auth-client.js";
import type { PublicUser } from "./api/auth-client.js";
import { SignInForm } from "./auth/SignInForm.js";
import { ProvidersScreen } from "./providers/ProvidersScreen.js";

type AuthState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: PublicUser };

/** Read once on mount from `?connected=spotify` / `?provider_error=...` — see ADR-0026. */
function readProviderRedirectMessage(search: string): string | null {
  const params = new URLSearchParams(search);
  const connected = params.get("connected");
  const error = params.get("provider_error");
  if (connected) return `Connected ${connected}.`;
  if (error) return `Could not connect: ${error}`;
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
    <main>
      <h1>Ekusupo</h1>
      <p>Move, sync, and back up your music library across providers.</p>

      {auth.status === "loading" && <p>Loading…</p>}

      {auth.status === "signed-out" && (
        <SignInForm onSignedIn={(user) => setAuth({ status: "signed-in", user })} />
      )}

      {auth.status === "signed-in" && (
        <div>
          <p>
            Signed in as {auth.user.email}{" "}
            <button type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </p>
          {redirectMessage && <p role="status">{redirectMessage}</p>}
          <ProvidersScreen />
        </div>
      )}
    </main>
  );
}
