import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * `node:crypto`'s built-in AES-256-GCM — same reasoning as ADR-0022's
 * password hashing: no new dependency, no native bindings, and
 * authenticated encryption (GCM's tag catches tampering, not just
 * confidentiality) is the right primitive for a provider's access/refresh
 * tokens, which are exactly the kind of secret CLAUDE.md §12.1 requires
 * encrypted at rest. See ADR-0025.
 */
function getKey(): Buffer {
  const keyHex = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "PROVIDER_TOKEN_ENCRYPTION_KEY must be set (32 bytes, hex-encoded) to store provider tokens.",
    );
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("PROVIDER_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

/** `iv:authTag:ciphertext`, all hex — self-contained, no separate column needed for the IV/tag. */
export function encryptTokens(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptTokens(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = stored.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted token payload.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
    "utf8",
  );
}
