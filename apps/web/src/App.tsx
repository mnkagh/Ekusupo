import { useEffect, useState } from "react";

import { authClient } from "./api/auth-client.js";
import type { PublicUser } from "./api/auth-client.js";
import { SignInForm } from "./auth/SignInForm.js";

type AuthState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: PublicUser };

/**
 * Everything past sign-in — connected providers, transfer setup, and
 * every other CLAUDE.md §8.2 screen — is separate, later work (ADR-0021,
 * ADR-0023 "What's deferred").
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    void authClient.getMe().then((user) => {
      setAuth(user ? { status: "signed-in", user } : { status: "signed-out" });
    });
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
          <p>Signed in as {auth.user.email}</p>
          <button type="button" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      )}
    </main>
  );
}
