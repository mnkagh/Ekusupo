import { useId } from "react";

import { THEME_PREFERENCES, type ThemePreference } from "./theme.js";
import { useTheme } from "./useTheme.js";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const DESCRIPTIONS: Record<ThemePreference, string> = {
  system: "Follows your device, and changes with it.",
  light: "Always light, whatever the device is set to.",
  dark: "Always dark, whatever the device is set to.",
};

/**
 * Three choices rather than a two-state switch.
 *
 * A plain light/dark toggle has to start somewhere, and whichever it
 * picks it has silently overridden the device setting the moment it is
 * rendered — so a phone that flips to dark at sunset stops being
 * followed. Keeping "System" as its own option means following the
 * device is a thing the user can choose, and choosing light or dark is
 * an explicit override rather than an accident.
 *
 * Radios, not buttons: these are one setting with three values, and a
 * radio group is what gives arrow-key navigation and the right screen
 * reader announcement for free.
 */
export function ThemeToggle() {
  const { preference, resolved, choose } = useTheme();
  const name = useId();

  return (
    <fieldset className="theme-toggle">
      <legend className="field__label">Appearance</legend>

      <div className="theme-toggle__options" role="radiogroup" aria-label="Appearance">
        {THEME_PREFERENCES.map((option) => (
          <label
            key={option}
            className={`theme-toggle__option${
              preference === option ? " theme-toggle__option--active" : ""
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={preference === option}
              onChange={() => choose(option)}
            />
            <span>{LABELS[option]}</span>
          </label>
        ))}
      </div>

      <p className="transfer-form__hint">
        {DESCRIPTIONS[preference]}
        {preference === "system" && ` Currently ${resolved}.`}
      </p>
    </fieldset>
  );
}
