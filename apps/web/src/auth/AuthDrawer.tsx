import type { PublicUser } from "../api/auth-client.js";
import { Drawer } from "../ui/Drawer.js";
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
 * Dialog behaviour (focus trap, Escape, restore) lives in `Drawer`,
 * which the settings panel shares.
 */
export function AuthDrawer({ open, initialMode, onClose, onSignedIn }: AuthDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} label="Account">
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
    </Drawer>
  );
}
