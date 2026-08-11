import { AccountScreen } from "../account/AccountScreen.js";
import type { PublicUser } from "../api/auth-client.js";
import { ThemeToggle } from "../theme/ThemeToggle.js";
import { Drawer } from "../ui/Drawer.js";
import { SettingsIcon } from "../ui/icons.js";

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  onDeleted: () => void;
}

/**
 * Everything that configures Ekusupo rather than operates it: how it
 * looks, and the account it belongs to.
 *
 * A drawer rather than a fifth panel in the workspace. Appearance and
 * account management are things someone visits occasionally and then
 * leaves; keeping them permanently in the scroll put "Delete my
 * account" directly beneath the transfer someone came here to run.
 *
 * Opens from the **left**, opposite the auth drawer, so the two never
 * read as the same panel showing different contents.
 */
export function SettingsDrawer({ open, onClose, user, onDeleted }: SettingsDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} label="Settings" side="left">
      <div className="settings">
        <header className="settings__header">
          <SettingsIcon size={22} />
          <div>
            <h2 className="section-title">Settings</h2>
            <span className="eyebrow">{user.email}</span>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="settings__section">
          <h3 className="settings__title">Theme</h3>
          <ThemeToggle />
        </section>

        <section className="settings__section">
          <AccountScreen user={user} onDeleted={onDeleted} />
        </section>
      </div>
    </Drawer>
  );
}
