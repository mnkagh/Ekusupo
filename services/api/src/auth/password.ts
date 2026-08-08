import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/**
 * `node:crypto`'s built-in `scrypt` — no new dependency, and no native
 * bindings to worry about compiling (unlike bcrypt/argon2 packages),
 * consistent with this repo's repeated preference for solving a
 * small problem directly rather than adding a library (ADR-0007,
 * ADR-0008, ADR-0020). See ADR-0022 for the full reasoning.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, expectedKey.length)) as Buffer;

  // Constant-time comparison — a plain `===`/`Buffer.equals` would leak
  // timing information about how many leading bytes matched.
  return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
}
