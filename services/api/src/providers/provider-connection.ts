export interface ProviderConnection {
  id: string;
  userId: string;
  provider: string;
  /** Encrypted (`token-encryption.ts`) JSON of an `@ekusupo/connector-sdk` `AuthSession`. */
  encryptedTokens: string;
  connectedAt: string;
}
