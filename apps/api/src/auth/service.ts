import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/database';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const id = randomBytes(16).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, userId, tokenHash, now.toISOString(), expires.toISOString());
  return token;
}

export function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = db
    .prepare(
      `
    SELECT u.id, u.email, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `,
    )
    .get(tokenHash) as { id: string; email: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return { id: row.id, email: row.email };
}

export function deleteSession(token: string | undefined) {
  if (!token) return;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}
