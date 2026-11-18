import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LyricsPanel } from '../lyrics/LyricsPanel';
import { VideoPlayer } from '../video/VideoPlayer';
import { Vinyl3D } from '../vinyl/Vinyl3D';
import { usePlayer } from '../../features/playback/usePlayer';

const navigation = [
  ['Listen', '/listen'],
  ['Search', '/search'],
  ['Library', '/library'],
  ['Playlists', '/playlists'],
  ['History', '/history'],
  ['Providers', '/providers'],
  ['Export', '/export'],
  ['Account', '/account'],
  ['Settings', '/settings'],
] as const;

export function AppShell() {
  const player = usePlayer();
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showVinyl, setShowVinyl] = useState(false);

  return (
    <>
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: -9999,
          top: 0,
        }}
      >
        Skip to content
      </a>
      <div className="app-grid">
        <aside className="sidebar">
          <div>
            <p
              className="pixel-frame"
              style={{ display: 'inline-block', padding: '6px 10px', margin: 0 }}
            >
              EKUSUPO
            </p>
            <h2 style={{ marginTop: 16 }}>Universal music and video</h2>
            <p style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
              Demo data is clearly marked until provider credentials are configured.
            </p>
          </div>
          <nav style={{ display: 'grid', gap: 8 }}>
            {navigation.map(([label, path]) => (
              <NavLink
                key={path}
                to={path}
                style={({ isActive }) => ({
                  padding: '10px 12px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: isActive ? 'var(--background)' : 'var(--foreground)',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--border)',
                })}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="card" style={{ marginTop: 'auto' }}>
            <strong>Session</strong>
            <p style={{ margin: '8px 0 0', color: 'var(--foreground-secondary)', fontSize: 14 }}>
              Guest mode is active until an account is connected.
            </p>
          </div>
        </aside>

        <main id="main-content" className="content">
          <Outlet />
        </main>

        <footer className="player-bar">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              className="vinyl"
              style={{
                width: 56,
                height: 56,
                animation: player.isPlaying ? 'spin 4s linear infinite' : 'none',
              }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>
                {player.currentTrack?.title ?? 'No track selected'}
              </div>
              <div style={{ color: 'var(--foreground-secondary)', fontSize: 13 }}>
                {player.currentTrack?.artist ?? 'Choose a track to begin'}
              </div>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
              <button onClick={player.previous}>Previous</button>
              <button onClick={player.togglePlay}>{player.isPlaying ? 'Pause' : 'Play'}</button>
              <button onClick={player.next}>Next</button>
            </div>
            <input
              type="range"
              min={0}
              max={player.duration || 100}
              value={player.progress}
              onChange={(event) => player.seek(Number(event.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--foreground-secondary)' }}>
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={player.volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
              />
            </label>
            <span style={{ fontSize: 12, color: 'var(--foreground-secondary)' }}>
              Queue: {player.queue.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLyrics(true)}>Lyrics</button>
              <button onClick={() => setShowVideo(true)}>Video</button>
              <button onClick={() => setShowVinyl(true)}>Vinyl</button>
            </div>
          </div>
        </footer>
        {(showLyrics || showVideo || showVinyl) && (
          <div
            onClick={() => {
              setShowLyrics(false);
              setShowVideo(false);
              setShowVinyl(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.72)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 50,
              padding: 24,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="media-dialog-title"
              className="card"
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(720px, 100%)', maxHeight: '80vh', overflow: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 id="media-dialog-title">{showVideo ? 'Video' : 'Lyrics'}</h2>
                <button
                  onClick={() => {
                    setShowLyrics(false);
                    setShowVideo(false);
                    setShowVinyl(false);
                  }}
                >
                  Close
                </button>
              </div>
              {showVideo ? (
                <VideoPlayer track={player.currentTrack} />
              ) : showVinyl ? (
                <div style={{ display: 'grid', placeItems: 'center', gap: 16 }}>
                  <Vinyl3D spinning={player.isPlaying} size={320} />
                  <div style={{ textAlign: 'center' }}>
                    <strong>{player.currentTrack?.title ?? 'No track selected'}</strong>
                    <div style={{ color: 'var(--foreground-secondary)', fontSize: 14 }}>
                      {player.currentTrack?.artist ?? 'Choose a track to begin'}
                    </div>
                  </div>
                </div>
              ) : (
                <LyricsPanel track={player.currentTrack} progress={player.progress} />
              )}
            </div>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}
