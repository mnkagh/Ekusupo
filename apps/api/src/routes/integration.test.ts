import { describe, expect, it } from 'vitest';
import { createServer } from '../server';

describe('api integration', () => {
  it('returns providers', async () => {
    const app = await createServer();
    const response = await app.inject({ method: 'GET', url: '/api/providers' });
    expect(response.statusCode).toBe(200);
    expect(response.json().some((provider: { id: string }) => provider.id === 'demo')).toBe(true);
    await app.close();
  });

  it('searches demo tracks', async () => {
    const app = await createServer();
    const response = await app.inject({ method: 'GET', url: '/api/search?provider=demo&q=clair' });
    expect(response.statusCode).toBe(200);
    expect(response.json().results.length).toBeGreaterThan(0);
    await app.close();
  });

  it('registers, creates a playlist, and exports it', async () => {
    const app = await createServer();
    const email = `test-${Date.now()}@example.com`;
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'password123' },
      headers: { 'content-type': 'application/json' },
    });
    expect(register.statusCode).toBe(200);

    const cookie = register.headers['set-cookie'];
    const create = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      payload: { name: 'Integration playlist' },
      headers: { 'content-type': 'application/json', cookie },
    });
    expect(create.statusCode).toBe(200);
    const playlistId = create.json().id;

    const trackId = 'demo-track-1';
    const add = await app.inject({
      method: 'POST',
      url: `/api/playlists/${playlistId}/tracks`,
      payload: { trackId },
      headers: { 'content-type': 'application/json', cookie },
    });
    expect(add.statusCode).toBe(200);

    const exported = await app.inject({
      method: 'GET',
      url: `/api/export/playlists/${playlistId}`,
      headers: { cookie },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().format).toBe('UPF');
    expect(exported.json().playlist.trackIds).toContain(trackId);

    await app.close();
  });
});
