import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthClientConfig {
  baseUrl?: string;
  /** Injectable, same pattern as `createSpotifyProvider`'s `fetchImpl` — lets tests avoid a real network call. */
  fetchImpl?: typeof fetch;
}

interface ErrorBody {
  error?: string;
}

/**
 * A factory, not a module-level client with hidden state — mirrors
 * `createSpotifyProvider`/`createUpfFileProvider`'s shape so this
 * codebase has one consistent way to build something that talks to an
 * external boundary. See ADR-0023.
 */
export function createAuthClient(config: AuthClientConfig = {}) {
  const baseUrl = config.baseUrl ?? API_BASE_URL;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    // Resolved per call, not captured once at factory time: `authClient`
    // below is a module-level singleton created at import time, before a
    // test's `vi.stubGlobal("fetch", ...)` ever runs — capturing `fetch`
    // eagerly here would silently keep using the real one regardless.
    const fetchImpl = config.fetchImpl ?? fetch;
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    const body = (await response.json().catch(() => ({}))) as T & ErrorBody;
    if (!response.ok) {
      throw new ApiError(body.error ?? "Request failed.", response.status);
    }
    return body;
  }

  return {
    signUp(email: string, password: string): Promise<{ user: PublicUser }> {
      return request("/auth/sign-up", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    signIn(email: string, password: string): Promise<{ user: PublicUser }> {
      return request("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    signOut(): Promise<{ signedOut: true }> {
      return request("/auth/sign-out", { method: "POST" });
    },

    /** Resolves to `undefined` rather than throwing when there's no signed-in user. */
    async getMe(): Promise<PublicUser | undefined> {
      try {
        const { user } = await request<{ user: PublicUser }>("/auth/me");
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return undefined;
        throw error;
      }
    },
  };
}

export const authClient = createAuthClient();
