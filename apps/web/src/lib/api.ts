const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  providers: () => request<Provider[]>('/providers'),
  search: (query: string, provider?: string, offset = 0) =>
    request<SearchResponse>(
      `/search?q=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider ?? 'all')}&limit=5&offset=${offset}`,
    ),
  library: () => request<LibraryResponse>('/library'),
  addLibrary: (trackId: string) =>
    request<void>('/library', { method: 'POST', body: JSON.stringify({ trackId }) }),
  playlists: () => request<Playlist[]>('/playlists'),
  createPlaylist: (name: string) =>
    request<Playlist>('/playlists', { method: 'POST', body: JSON.stringify({ name }) }),
  addPlaylistTrack: (playlistId: string, trackId: string) =>
    request<void>(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),
  history: () => request<HistoryEntry[]>('/history'),
  recordHistory: (trackId: string) =>
    request<void>('/history', { method: 'POST', body: JSON.stringify({ trackId }) }),
  exportPlaylist: (playlistId: string) =>
    request<ExportDocument>(`/export/playlists/${playlistId}`),
  transferPreview: (body: TransferRequest) =>
    request<TransferReport>('/transfers/preview', { method: 'POST', body: JSON.stringify(body) }),
};

export interface Provider {
  id: string;
  name: string;
  status: 'connected' | 'available' | 'requires_configuration' | 'coming_soon';
  capabilities: string[];
  description: string;
}

export interface TrackDto {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
  artworkUrl?: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'video';
  provider: string;
  source: 'demo' | 'live' | 'imported';
}

export interface SearchResponse {
  query: string;
  provider: string;
  results: TrackDto[];
  demo: boolean;
  nextOffset: number | null;
}

export interface LibraryResponse {
  tracks: TrackDto[];
  demo: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface HistoryEntry {
  id: string;
  track: TrackDto;
  playedAt: string;
}

export interface ExportDocument {
  format: 'UPF';
  version: string;
  playlist: { name: string; trackIds: string[] };
  tracks: TrackDto[];
}

export interface TransferRequest {
  sourceProvider: string;
  destinationProvider: string;
  playlistId?: string;
}

export interface TransferReport {
  id: string;
  sourceProvider: string;
  destinationProvider: string;
  matched: number;
  unmatched: number;
  dryRun: true;
  items: Array<{
    sourceTrackId: string;
    destinationTrackId?: string;
    status: 'matched' | 'unmatched';
  }>;
}
