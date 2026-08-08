import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "./password.js";
import type { SessionStore } from "./session-store.js";
import type { UserStore } from "./user-store.js";
import type { User } from "./user.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A user-facing auth failure (bad credentials, taken email, ...) — never a server error. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthServiceDeps {
  userStore: UserStore;
  sessionStore: SessionStore;
}

export interface AuthResult {
  user: User;
  sessionId: string;
  expiresAt: string;
}

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Own session-based auth (ADR-0017) — no third-party auth service, no
 * JWT. Sessions are opaque server-side tokens; `SessionStore`/`UserStore`
 * are injected so this has no idea whether it's backed by
 * `InMemoryUserStore` (today) or Postgres (later, ADR-0022).
 */
export class AuthService {
  private readonly userStore: UserStore;
  private readonly sessionStore: SessionStore;

  constructor(deps: AuthServiceDeps) {
    this.userStore = deps.userStore;
    this.sessionStore = deps.sessionStore;
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    if (!isValidEmail(email)) throw new AuthError("Enter a valid email address.");
    if (password.length < 8) throw new AuthError("Password must be at least 8 characters.");

    const existing = await this.userStore.findByEmail(email);
    if (existing) throw new AuthError("An account with that email already exists.");

    const user: User = {
      id: randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await this.userStore.create(user);

    return this.createSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const user = await this.userStore.findByEmail(email);
    // Same message whether the email doesn't exist or the password is
    // wrong — this must not let a caller enumerate registered emails.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError("Incorrect email or password.");
    }
    return this.createSession(user);
  }

  async signOut(sessionId: string): Promise<void> {
    await this.sessionStore.delete(sessionId);
  }

  async getUserForSession(sessionId: string): Promise<User | undefined> {
    const session = await this.sessionStore.get(sessionId);
    if (!session) return undefined;

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.sessionStore.delete(sessionId);
      return undefined;
    }

    return this.userStore.findById(session.userId);
  }

  private async createSession(user: User): Promise<AuthResult> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const sessionId = newSessionId();
    await this.sessionStore.create({
      id: sessionId,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    });
    return { user, sessionId, expiresAt };
  }
}
