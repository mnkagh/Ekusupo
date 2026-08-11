import type { Database } from "../db/client.js";
import { PostgresProviderCredentialStore } from "./provider-credential-store.js";
import type { ProviderCredentials } from "./provider-registry.js";

export interface CredentialResolverDeps {
  db: Database;
  /** The deployment's own credentials, keyed by provider id. */
  serverCredentials: Record<string, ProviderCredentials>;
}

export type CredentialSource = "user" | "server" | "none";

export interface ResolvedCredentials {
  credentials: ProviderCredentials;
  source: CredentialSource;
}

/** A user's stored credentials are only usable if they actually carry something. */
function isUsable(
  credentials: ProviderCredentials | undefined,
): credentials is ProviderCredentials {
  if (!credentials) return false;
  return Boolean(credentials.clientId && credentials.clientSecret);
}

/**
 * Which credentials to use for this user and this provider.
 *
 * **The user's own come first, and the deployment's are the fallback.**
 * That order is the point of the feature: someone who has registered
 * their own Spotify app is no longer subject to the operator's 25-user
 * development cap or their rate limits, and the operator is no longer
 * the gatekeeper for everyone who wants to use their own library.
 *
 * They are never merged. A half-filled user record falling back
 * field-by-field to the server's would produce one user's client id
 * paired with another's secret — an authorization that fails in a way
 * nobody could diagnose. Either a user's credentials are complete and
 * used whole, or they are ignored whole.
 */
export async function resolveCredentials(
  userId: string,
  provider: string,
  deps: CredentialResolverDeps,
): Promise<ResolvedCredentials> {
  const store = new PostgresProviderCredentialStore(deps.db, userId);

  let own: ProviderCredentials | undefined;
  try {
    own = await store.get(provider);
  } catch (error) {
    // A decryption failure means the encryption key changed under stored
    // data. Falling back to the server's credentials keeps the product
    // usable rather than failing shut on something the user cannot fix.
    console.warn(`[Ekusupo API] could not read stored credentials for ${provider}`, error);
  }

  if (isUsable(own)) return { credentials: own, source: "user" };

  const server = deps.serverCredentials[provider];
  if (isUsable(server)) return { credentials: server, source: "server" };

  return { credentials: server ?? {}, source: "none" };
}
