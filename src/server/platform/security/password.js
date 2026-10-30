import { format } from "../../../shared/i18n.js";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Password hashing with scrypt (memory-hard, built into Node: no native dependency). Stored format:
// scrypt$N$r$p$salt(b64)$hash(b64). Parameters travel with the hash, so they can be raised later
// and old hashes are upgraded at the next successful login (needsRehash). An optional server-side
// pepper (PASSWORD_PEPPER) is mixed in with HMAC-SHA-256 before hashing: a stolen database alone is
// then not enough to test guesses offline.

const MIN_LENGTH = 12;
const MAX_LENGTH = 128; // bounds the work an attacker can force with a huge body
const KEY_LENGTH = 64;
const COMMON = new Set([
  "password",
  "password1",
  "123456789012",
  "qwertyuiopas",
  "azertyuiopqs",
  "letmein12345",
  "iloveyou1234",
  "administrator",
  "welcome12345",
  "changeme1234",
  "motdepasse12",
  "honorofkings",
  "honorofkings1",
  "hokscrimlab"
]);

export function normalizePassword(value) {
  return String(value ?? "").normalize("NFKC");
}

/**
 * Returns what is wrong with a password as `{ template, params }` messages (empty = acceptable),
 * translated by the caller.
 */
export function passwordIssues(password, { email = "", name = "" } = {}) {
  const value = normalizePassword(password);
  const problems = [];
  const issue = (template, params = {}) => problems.push({ template, params });
  if (value.length < MIN_LENGTH) {
    issue("Use at least {min} characters.", { min: MIN_LENGTH });
  }
  if (value.length > MAX_LENGTH) {
    issue("Use at most {max} characters.", { max: MAX_LENGTH });
  }
  const lowered = value.toLowerCase();
  if (
    COMMON.has(lowered) ||
    /^(password|passw0rd|motdepasse|azerty|qwerty|letmein|welcome|admin|iloveyou|changeme|honorofkings)[\d!_.-]*$/.test(
      lowered
    ) ||
    /^(.)\1+$/.test(value) ||
    /^(?:0123456789|1234567890|abcdefghij|qwertyuiop|azertyuiop)/.test(lowered)
  ) {
    issue("This password is too common.");
  }
  const local = String(email).split("@")[0].toLowerCase();
  if (local.length >= 4 && lowered.includes(local)) {
    issue("The password must not contain your email name.");
  }
  const first = String(name).trim().toLowerCase();
  if (first.length >= 4 && lowered.includes(first)) {
    issue("The password must not contain your name.");
  }
  if (new Set(value).size < 5) {
    issue("Use a greater variety of characters.");
  }
  return problems;
}

/** The same problems as plain English sentences. */
export function passwordProblems(password, context) {
  return passwordIssues(password, context).map(({ template, params }) => format(template, params));
}

function derive(password, salt, { N, r, p }, pepper) {
  const input = pepper
    ? createHmac("sha256", pepper).update(normalizePassword(password)).digest()
    : Buffer.from(normalizePassword(password), "utf8");
  return new Promise((resolve, reject) => {
    scrypt(
      input,
      salt,
      KEY_LENGTH,
      { N, r, p, maxmem: 256 * N * r + 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

// scrypt runs on libuv's small thread pool: bound how many hashes run at once so a flood of logins
// cannot starve the app.
function limiter(limit) {
  let active = 0;
  const waiting = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async work => {
    if (active >= limit) {
      await new Promise(resolve => waiting.push(resolve));
    }
    active += 1;
    try {
      return await work();
    } finally {
      release();
    }
  };
}
const gate = limiter(2);

export async function hashPassword(password, { log2N = 17, r = 8, p = 1, pepper = "" } = {}) {
  const salt = randomBytes(16);
  const params = { N: 2 ** log2N, r, p };
  const key = await gate(() => derive(password, salt, params, pepper));
  return `scrypt$${params.N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function parse(stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return null;
  }
  const [, N, r, p, salt, hash] = parts;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (
    ![params.N, params.r, params.p].every(Number.isInteger) ||
    params.N < 2 ** 10 ||
    params.N > 2 ** 20 ||
    (params.N & (params.N - 1)) !== 0
  ) {
    return null;
  }
  return { params, salt: Buffer.from(salt, "base64"), hash: Buffer.from(hash, "base64") };
}

export async function verifyPassword(password, stored, { pepper = "" } = {}) {
  const parsed = parse(stored);
  if (!parsed || normalizePassword(password).length > MAX_LENGTH) {
    return false;
  }
  const key = await gate(() => derive(password, parsed.salt, parsed.params, pepper));
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

export function needsRehash(stored, { log2N = 17, r = 8, p = 1 } = {}) {
  const parsed = parse(stored);
  return !parsed || parsed.params.N < 2 ** log2N || parsed.params.r < r || parsed.params.p < p;
}

let dummy = null;
/**
 * Burns the same time as a real check, so an unknown email is indistinguishable from a wrong
 * password.
 */
export async function burnPasswordCheck(password, options = {}) {
  dummy ??= await hashPassword("dummy-password-for-timing", {
    log2N: options.log2N ?? 17,
    pepper: options.pepper ?? ""
  });
  await verifyPassword(password, dummy, { pepper: options.pepper ?? "" });
}
