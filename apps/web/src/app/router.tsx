import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LandingPage } from '../pages/LandingPage';
import { ListenPage } from '../pages/ListenPage';
import { SearchPage } from '../pages/SearchPage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistsPage } from '../pages/PlaylistsPage';
import { HistoryPage } from '../pages/HistoryPage';
import { ProvidersPage } from '../pages/ProvidersPage';
import { ExportPage } from '../pages/ExportPage';
import { AccountPage } from '../pages/AccountPage';
import { SettingsPage } from '../pages/SettingsPage';

export function EkusupoRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AppShell />}>
        <Route path="/listen" element={<ListenPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
