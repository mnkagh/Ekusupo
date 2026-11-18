import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  getSessionUser,
} from './service';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
    if (existing) return reply.code(409).send({ error: 'Email already registered' });

    const id = randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(parsed.data.password);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, parsed.data.email, passwordHash, now, now);

    const token = createSession(id);
    reply.setCookie('ekusupo_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24 * 30,
    });
    return { id, email: parsed.data.email };
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const user = db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(parsed.data.email) as { id: string; email: string; password_hash: string } | undefined;
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = createSession(user.id);
    reply.setCookie('ekusupo_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24 * 30,
    });
    return { id: user.id, email: user.email };
  });

  app.post('/auth/logout', async (request, reply) => {
    deleteSession(request.cookies.ekusupo_session);
    reply.clearCookie('ekusupo_session', { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const user = getSessionUser(request.cookies.ekusupo_session);
    if (!user) return { user: null };
    return { user };
  });
}

export function getSessionFromRequest(request: { cookies: { ekusupo_session?: string } }) {
  return getSessionUser(request.cookies.ekusupo_session);
}
