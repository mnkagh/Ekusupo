import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <section className="hero">
      <div>
        <p
          className="pixel-frame"
          style={{ display: 'inline-block', padding: '6px 10px', margin: 0 }}
        >
          EKUSUPO
        </p>
        <h1 style={{ fontSize: 'clamp(3rem, 8vw, 6.5rem)', lineHeight: 0.95, marginTop: 24 }}>
          A universal stage for every sound and frame.
        </h1>
        <p
          style={{
            color: 'var(--foreground-secondary)',
            fontSize: 20,
            maxWidth: 640,
            marginTop: 24,
          }}
        >
          Search, play, collect and transfer music across providers inside one polished monochrome
          workspace.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
          <Link to="/account" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            Create account
          </Link>
          <Link to="/listen" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            Continue as guest
          </Link>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 40,
          }}
        >
          {['YouTube Music', 'Spotify', 'SoundCloud', 'Internet Archive', 'Deezer'].map(
            (provider) => (
              <div key={provider} className="card" style={{ padding: 14 }}>
                {provider}
              </div>
            ),
          )}
        </div>
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <div
          className="vinyl"
          style={{ width: 360, height: 360, animation: 'spin 8s linear infinite' }}
        />
      </div>
    </section>
  );
}
