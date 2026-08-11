import { useEffect, useRef, type ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive tech. */
  label: string;
  /** Which edge it slides in from. Defaults to the right. */
  side?: "left" | "right";
  children: ReactNode;
}

/**
 * A side panel with the behaviour a dialog is required to have: focus
 * moves in on open, Tab is trapped inside it, Escape closes it, and
 * focus returns to whatever opened it.
 *
 * Extracted from the auth drawer when settings needed a second one.
 * Duplicating a focus trap is how one copy quietly drifts out of step
 * with the other, and a half-working trap is worse than none — a
 * keyboard user tabs out of the panel into a page they cannot see.
 *
 * Kept mounted while closed and hidden with `inert` rather than
 * unmounted, so it can animate out instead of vanishing on the frame the
 * state flips. `inert` also takes it out of the tab order and the
 * accessibility tree, which `visibility: hidden` alone does not
 * guarantee everywhere.
 */
export function Drawer({ open, onClose, label, side = "right", children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Land inside the panel rather than at the top of the page behind
    // it. A field if there is one, otherwise the first control.
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>("input, select, textarea") ??
      panelRef.current?.querySelector<HTMLElement>("button");
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
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
    <div className={`drawer drawer--${side} ${open ? "drawer--open" : ""}`}>
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
        aria-label={label}
        ref={panelRef}
        inert={!open}
      >
        <div className="drawer__rail" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
