import { useId, useState } from "react";
import type { FormEvent } from "react";

import { accountClient } from "../api/account-client.js";
import type { PublicUser } from "../api/auth-client.js";
import { ApiError } from "../api/errors.js";

interface AccountScreenProps {
  user: PublicUser;
  /** Called after the account is deleted, so the shell can return to signed-out. */
  onDeleted: () => void;
}

type PasswordState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done" }
  | { status: "error"; message: string };

type DeleteState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "deleting" }
  | { status: "error"; message: string };

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Account settings — the last of CLAUDE.md §8.2's MVP screens, and where
 * §21.2's promises become buttons: change your password, take your data
 * with you, delete everything.
 *
 * Deletion is deliberately awkward: it needs the password *and* a typed
 * confirmation, and the API enforces both independently of this UI. A
 * one-click irreversible action would violate §9.3 no matter how the
 * button was styled.
 */
export function AccountScreen({ user, onDeleted }: AccountScreenProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [password, setPassword] = useState<PasswordState>({ status: "idle" });

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [remove, setRemove] = useState<DeleteState>({ status: "idle" });

  const currentId = useId();
  const newId = useId();
  const deletePasswordId = useId();
  const deleteConfirmId = useId();

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPassword({ status: "saving" });

    void accountClient
      .changePassword(currentPassword, newPassword)
      .then(() => {
        setPassword({ status: "done" });
        setCurrentPassword("");
        setNewPassword("");
      })
      .catch((error: unknown) => {
        setPassword({ status: "error", message: messageFrom(error, "Could not change password.") });
      });
  };

  const submitDelete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRemove({ status: "deleting" });

    void accountClient
      .deleteAccount(deletePassword)
      .then(onDeleted)
      .catch((error: unknown) => {
        setRemove({ status: "error", message: messageFrom(error, "Could not delete account.") });
      });
  };

  return (
    <section className="panel rise" style={{ "--delay": "120ms" } as React.CSSProperties}>
      <div className="panel__header panel__header--split">
        <div className="panel__heading">
          <h2 className="section-title">Account</h2>
          <span className="eyebrow">{user.email}</span>
        </div>
      </div>

      <div className="panel__body">
        <form className="transfer-form" onSubmit={submitPassword}>
          <h3 className="history__heading">Change password</h3>

          <label className="field__label" htmlFor={currentId}>
            Current password
          </label>
          <input
            id={currentId}
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />

          <label className="field__label" htmlFor={newId}>
            New password
          </label>
          <input
            id={newId}
            className="field__input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <p className="transfer-form__hint">
            At least 8 characters. Changing it signs out your other devices.
          </p>

          <button
            type="submit"
            className="btn btn--connect"
            disabled={password.status === "saving" || !currentPassword || !newPassword}
          >
            {password.status === "saving" ? "Saving…" : "Change password"}
          </button>

          {password.status === "done" && (
            <p role="status" className="notice notice--ok">
              Password changed. Your other devices have been signed out.
            </p>
          )}
          {password.status === "error" && (
            <p role="alert" className="notice notice--error">
              {password.message}
            </p>
          )}
        </form>

        <section className="history">
          <h3 className="history__heading">Your data</h3>
          <p className="transfer-form__hint">
            Everything Ekusupo stores about you, as one JSON file: your account, which providers you
            have connected, your transfer history, and any UPF exports. Provider access tokens are
            excluded — they are stored encrypted and never handed back. Disconnect a provider to
            revoke them.
          </p>
          <a className="btn btn--ghost" href={accountClient.exportUrl()} download>
            Download my data
          </a>
        </section>

        <section className="history">
          <h3 className="history__heading">Delete account</h3>
          <p className="transfer-form__hint">
            This removes your account, your provider connections and their stored tokens, your
            transfer history, and your UPF exports. It cannot be undone.
          </p>

          {remove.status === "idle" ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setRemove({ status: "confirming" })}
            >
              Delete my account
            </button>
          ) : (
            <form className="transfer-form" onSubmit={submitDelete}>
              <label className="field__label" htmlFor={deletePasswordId}>
                Your password
              </label>
              <input
                id={deletePasswordId}
                className="field__input"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />

              <label className="field__label" htmlFor={deleteConfirmId}>
                Type DELETE to confirm
              </label>
              <input
                id={deleteConfirmId}
                className="field__input"
                type="text"
                autoComplete="off"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
              />

              <div className="confirm__actions">
                <button
                  type="submit"
                  className="btn btn--connect"
                  disabled={
                    remove.status === "deleting" || deleteConfirm !== "DELETE" || !deletePassword
                  }
                >
                  {remove.status === "deleting" ? "Deleting…" : "Delete permanently"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setRemove({ status: "idle" });
                    setDeletePassword("");
                    setDeleteConfirm("");
                  }}
                >
                  Cancel
                </button>
              </div>

              {remove.status === "error" && (
                <p role="alert" className="notice notice--error">
                  {remove.message}
                </p>
              )}
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
