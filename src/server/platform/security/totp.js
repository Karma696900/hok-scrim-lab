import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import qrcode from "qrcode-generator";

// RFC 6238 TOTP (HMAC-SHA-1, 6 digits, 30 s) — what Google Authenticator, Aegis, 1Password,
// Authy... all speak.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateSecret = () => base32Encode(randomBytes(20)); // 160 bits

export function hotp(secret, counter) {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * Checks a code against the current step and one step either side (clock drift). Returns the
 * matched step or null. A step can be used only once: pass the last accepted step as `afterStep`
 * (replay protection).
 */
export function verifyTotp(secret, code, { now = Date.now(), afterStep = null, window = 1 } = {}) {
  const candidate = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) {
    return null;
  }
  const current = stepAt(now);
  let matched = null;
  for (let step = current - window; step <= current + window; step += 1) {
    // Every candidate is compared (no early exit), in constant time.
    const expected = Buffer.from(hotp(secret, step));
    if (
      timingSafeEqual(expected, Buffer.from(candidate)) &&
      (afterStep === null || step > afterStep)
    ) {
      matched = step;
    }
  }
  return matched;
}

export function otpauthUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** SVG QR code as a data: URI (generated here: the secret never goes to a third-party QR service). */
export function qrDataUri(text) {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const svg = code.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ---- recovery codes -----------------------------------------------------------------------------
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const raw = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`; // 10 chars ≈ 50 bits
  });
}

export const normalizeRecoveryCode = value =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
