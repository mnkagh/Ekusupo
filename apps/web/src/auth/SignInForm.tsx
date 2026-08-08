import { useState } from "react";
import type { FormEvent } from "react";

import { authClient } from "../api/auth-client.js";
import type { PublicUser } from "../api/auth-client.js";
import { ApiError } from "../api/errors.js";

type Mode = "sign-in" | "sign-up";
type Status = "idle" | "submitting" | "failed";

export interface SignInFormProps {
  onSignedIn: (user: PublicUser) => void;
}

/** Toggles between sign-in and sign-up rather than being two separate forms — same fields, same submit handler. */
export function SignInForm({ onSignedIn }: SignInFormProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    try {
      const { user } =
        mode === "sign-in"
          ? await authClient.signIn(email, password)
          : await authClient.signUp(email, password);
      onSignedIn(user);
    } catch (error) {
      setStatus("failed");
      setErrorMessage(error instanceof ApiError ? error.message : "Something went wrong.");
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <h2>{mode === "sign-in" ? "Sign in" : "Create an account"}</h2>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Sign up"}
      </button>

      {status === "failed" && <p role="alert">{errorMessage}</p>}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setStatus("idle");
        }}
      >
        {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
