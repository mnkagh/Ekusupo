import { describe, expect, it } from 'vitest';
import { createServer } from './server';

describe('server', () => {
  it('creates a Fastify instance with a health route', async () => {
    const server = await createServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });
});
