import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptTokens, encryptTokens } from "./token-encryption.js";

const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

afterEach(() => {
  process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("encryptTokens / decryptTokens", () => {
  it("decrypts back to the original plaintext", () => {
    const plaintext = JSON.stringify({ accessToken: "abc", refreshToken: "def" });
    const encrypted = encryptTokens(plaintext);

    expect(decryptTokens(encrypted)).toBe(plaintext);
  });

  it("never stores the plaintext — the encrypted payload doesn't contain it", () => {
    const encrypted = encryptTokens("super-secret-access-token");
    expect(encrypted).not.toContain("super-secret-access-token");
  });

  it("produces a different ciphertext each time (random IV per call)", () => {
    const first = encryptTokens("same plaintext");
    const second = encryptTokens("same plaintext");
    expect(first).not.toBe(second);
  });

  it("throws instead of silently returning garbage when the payload was tampered with", () => {
    const encrypted = encryptTokens("secret");
    const [iv, authTag, data] = encrypted.split(":");
    const tampered = `${iv}:${authTag}:${data?.slice(0, -2)}00`;

    expect(() => decryptTokens(tampered)).toThrow();
  });

  it("throws a clear error when no encryption key is configured", () => {
    delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptTokens("secret")).toThrow(/PROVIDER_TOKEN_ENCRYPTION_KEY/);
  });
});
