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

  /**
   * Requires the current password even though the caller is already
   * authenticated: an unattended session is the exact situation a
   * password change needs to defend against, and without this check
   * anyone at the keyboard could lock the owner out.
   *
   * Every existing session is invalidated and a fresh one returned, so
   * the change signs out other devices without signing out the person
   * making it. Whoever knew the old password may still hold a live
   * session; leaving those standing would make the change decorative.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const user = await this.userStore.findById(userId);
    if (!user) throw new AuthError("That account no longer exists.");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AuthError("That is not your current password.");
    }
    if (newPassword.length < 8) throw new AuthError("Password must be at least 8 characters.");
    if (newPassword === currentPassword) {
      throw new AuthError("The new password must be different from the current one.");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.userStore.updatePassword(userId, passwordHash);
    await this.sessionStore.deleteForUser(userId);

    return this.createSession({ ...user, passwordHash });
  }

  /**
   * Irreversible, so it asks for the password too (CLAUDE.md §9.3, §21.2).
   * The store's cascade takes sessions, provider connections — encrypted
   * tokens and all — and transfer history with it.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.userStore.findById(userId);
    if (!user) throw new AuthError("That account no longer exists.");
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError("That is not your password.");
    }
    await this.userStore.delete(userId);
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
