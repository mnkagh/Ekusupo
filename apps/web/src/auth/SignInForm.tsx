import { useId, useState } from "react";
import type { FormEvent } from "react";

import { authClient } from "../api/auth-client.js";
import type { PublicUser } from "../api/auth-client.js";
import { ApiError } from "../api/errors.js";
import { useTilt } from "../visuals/useTilt.js";

type Mode = "sign-in" | "sign-up";
type Status = "idle" | "submitting" | "failed";

export interface SignInFormProps {
  onSignedIn: (user: PublicUser) => void;
  /** Which side of the toggle to open on — the landing page has separate entry points for each. */
  initialMode?: Mode;
  /** Rendered only when provided, so the form still works outside a dismissible container. */
  onCancel?: () => void;
}

/** Toggles between sign-in and sign-up rather than being two separate forms — same fields, same submit handler. */
export function SignInForm({ onSignedIn, initialMode = "sign-in", onCancel }: SignInFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Explicit ids rather than wrapping the input in its label: the label
  // is now a separate styled element above the field, so the association
  // has to be stated rather than implied by nesting.
  const emailId = useId();
  const passwordId = useId();

  const panelRef = useTilt<HTMLDivElement>({ max: 4, lift: 4 });

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
    <div className="panel" ref={panelRef}>
      <div className="panel__header panel__header--split">
        <div>
          <span className="eyebrow eyebrow--signal">
            {mode === "sign-in" ? "Authenticate" : "Register"}
          </span>
          <h2 className="section-title">{mode === "sign-in" ? "Sign in" : "Create an account"}</h2>
        </div>
        {onCancel && (
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      <div className="panel__body">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label className="field__label" htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              className="field__input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor={passwordId}>
              Password
            </label>
            <input
              id={passwordId}
              className="field__input"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="btn btn--primary" disabled={status === "submitting"}>
            {status === "submitting" ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>

          {status === "failed" && (
            <p role="alert" className="notice notice--error" style={{ marginTop: "1rem" }}>
              {errorMessage}
            </p>
          )}

          <button
            type="button"
            className="btn btn--link"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setStatus("idle");
            }}
          >
            {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
