import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { migrate } from './db/database';
import { seedDatabase } from './db/seed';
import { registerAuthRoutes } from './auth/routes';
import { registerProviderRoutes } from './routes/providers';
import { registerSearchRoutes } from './routes/search';
import { registerLibraryRoutes } from './routes/library';
import { registerPlaylistRoutes } from './routes/playlists';
import { registerHistoryRoutes } from './routes/history';
import { registerExportRoutes } from './routes/export';
import { registerTransferRoutes } from './routes/transfers';

migrate();
seedDatabase();

export async function createServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5174',
    credentials: true,
  });
  await app.register(cookie, { secret: process.env.COOKIE_SECRET ?? 'ekusupo-dev-cookie-secret' });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }));
      registerAuthRoutes(api);
      registerProviderRoutes(api);
      registerSearchRoutes(api);
      registerLibraryRoutes(api);
      registerPlaylistRoutes(api);
      registerHistoryRoutes(api);
      registerExportRoutes(api);
      registerTransferRoutes(api);
    },
    { prefix: '/api' },
  );

  return app;
}

async function start() {
  const app = await createServer();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '127.0.0.1' });
}

if (!process.env.VITEST) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
