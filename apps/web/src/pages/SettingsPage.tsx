import { useEffect, useState } from 'react';

export function SettingsPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div>
      <h1>Settings</h1>
      <div className="card" style={{ marginTop: 24, maxWidth: 420 }}>
        <label>
          Theme
          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value as 'dark' | 'light')}
          >
            <option value="dark">Dark monochrome</option>
            <option value="light">Light monochrome</option>
          </select>
        </label>
        <p style={{ color: 'var(--foreground-secondary)', fontSize: 14, marginTop: 12 }}>
          Theme preference is stored in this browser for guest mode.
        </p>
      </div>
    </div>
  );
}
