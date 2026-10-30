import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// AES-256-GCM for secrets that must be recoverable (TOTP seeds). The key lives OUTSIDE the database
// (MFA_ENCRYPTION_KEY), so a database leak alone does not reveal anyone's authenticator seed.
// Format: v1.iv.tag.ciphertext (base64url). `context` is authenticated (bound to the user), so a
// seed cannot be copied from one account to another.

export function parseKey(value) {
  const key = Buffer.from(String(value ?? ""), "base64");
  if (key.length !== 32) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be 32 random bytes encoded in base64 (generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")."
    );
  }
  return key;
}

export function createSecretBox(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("A 32-byte key is required.");
  }
  return {
    encrypt(plaintext, context = "") {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        body.toString("base64url")
      ].join(".");
    },
    decrypt(payload, context = "") {
      const [version, iv, tag, body] = String(payload ?? "").split(".");
      if (version !== "v1" || !iv || !tag || !body) {
        throw new Error("Unreadable secret.");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}

/**
 * Where the key that encrypts the authenticator seeds comes from:
 *  - MFA_ENCRYPTION_KEY (required in production; keep it in a secret manager, never in the database or the repo);
 *  - development only: a random key generated once into a git-ignored file (.data/mfa.key, mode 600).
 */
export function loadSecretBox(config, logger) {
  if (config.mfaKey) {
    return createSecretBox(parseKey(config.mfaKey));
  }
  if (config.production) {
    throw new Error("MFA_ENCRYPTION_KEY is required in production.");
  }
  const file = path.resolve(config.mfaKeyFile);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* not supported on this filesystem */
    }
    logger?.warn("generated a development MFA key", { file });
  }
  return createSecretBox(parseKey(readFileSync(file, "utf8").trim()));
}
