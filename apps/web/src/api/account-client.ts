import { API_BASE_URL } from "./config.js";
import { ApiError } from "./errors.js";

export interface AccountClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ErrorBody {
  error?: string;
}

/**
 * Account settings — CLAUDE.md §21.2's user-control promise. Note what is
 * *not* here: any way to read a provider token back. They are encrypted
 * at rest precisely so nothing hands them out, including the data export.
 */
export function createAccountClient(config: AccountClientConfig = {}) {
  const baseUrl = config.baseUrl ?? API_BASE_URL;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
      return request("/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },

    /**
     * `confirm: "DELETE"` is required by the API's schema, not decoration
     * here — deleting an account is irreversible, and the password alone
     * proves who is asking but not that they meant to.
     */
    deleteAccount(password: string): Promise<{ deleted: true }> {
      return request("/account", {
        method: "DELETE",
        body: JSON.stringify({ password, confirm: "DELETE" }),
      });
    },

    /**
     * A URL to navigate to or put in an `<a download>`, never something
     * to `fetch()` — the response carries a `Content-Disposition`
     * attachment header, which only the browser's download machinery
     * acts on.
     */
    exportUrl(): string {
      return `${baseUrl}/account/export`;
    },
  };
}

export const accountClient = createAccountClient();
