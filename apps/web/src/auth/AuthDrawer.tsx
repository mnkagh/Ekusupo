import { useEffect, useRef } from "react";

import type { PublicUser } from "../api/auth-client.js";
import { SignInForm } from "./SignInForm.js";

export interface AuthDrawerProps {
  open: boolean;
  initialMode: "sign-in" | "sign-up";
  onClose: () => void;
  onSignedIn: (user: PublicUser) => void;
}

/**
 * The auth form as a side panel rather than a permanent column.
 *
 * Keeping the landing page to one idea — what the product does — means
 * the form has to arrive on request. A drawer does that without a route
 * change or a full-screen modal that throws the page away.
 *
 * Kept mounted while closed and hidden with `inert` instead of being
 * unmounted, so the panel can animate out rather than disappearing on
 * the frame the state flips. `inert` also removes it from the tab order
 * and the accessibility tree while off-screen, which `visibility:
 * hidden` alone would not guarantee across browsers.
 */
export function AuthDrawer({ open, initialMode, onClose, onSignedIn }: AuthDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the first field so a keyboard user lands inside the panel
    // rather than at the top of the page behind it.
    const firstInput = panelRef.current?.querySelector<HTMLInputElement>("input");
    firstInput?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Trap: without this, tabbing past the last field walks into the
      // page behind an open panel.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, input, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  return (
    <div className={`drawer ${open ? "drawer--open" : ""}`}>
      <button
        type="button"
        className="drawer__scrim"
        aria-label="Close"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />

      <div
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        ref={panelRef}
        inert={!open}
      >
        <div className="drawer__rail" aria-hidden="true" />
        {/*
          Keyed on the mode so opening a different entry point remounts
          the form with that mode as its initial state. Syncing a prop
          into state inside an effect would do the same thing, but React
          treats that as an anti-pattern for good reason: it renders once
          with the stale mode before correcting itself.
        */}
        <SignInForm
          key={initialMode}
          initialMode={initialMode}
          onSignedIn={onSignedIn}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
