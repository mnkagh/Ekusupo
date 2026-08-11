import { useCallback, useEffect, useState } from "react";

import { onColorSchemeChange } from "../visuals/media.js";
import {
  applyTheme,
  readStoredPreference,
  storePreference,
  systemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme.js";

export interface Theme {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  choose: (preference: ThemePreference) => void;
}

/**
 * The theme preference, applied to the document and kept in step with
 * the OS.
 *
 * `resolved` is derived during render rather than held in its own state.
 * The obvious shape — an effect that recomputes it and calls `setState`
 * — schedules a second render for a value already known during the
 * first, and React flags it as a cascading render. Only the *system*
 * setting is state here, because only that arrives asynchronously.
 *
 * The initial preference is read from storage rather than defaulted,
 * because `index.html` has already applied the same stored value before
 * first paint; starting from a default would re-apply the wrong theme a
 * frame later and cause exactly the flash that inline script prevents.
 */
export function useTheme(): Theme {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  const resolved: ResolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Always listening, even under an explicit choice: the listener only
  // updates what the *system* says, and `resolved` ignores that unless
  // the preference is "system". Subscribing conditionally would mean a
  // stale value the moment someone switched back to following the device.
  useEffect(() => onColorSchemeChange(() => setSystem(systemTheme())), []);

  const choose = useCallback((next: ThemePreference) => {
    storePreference(next);
    setPreference(next);
  }, []);

  return { preference, resolved, choose };
}
