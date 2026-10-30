// All environment-driven settings live here. Nothing secret has a built-in default.
import {
  PROVIDERS,
  REQUIREMENTS
} from "./features/translations/providers/translation-providers.js";

const KNOWN_DEFAULT_SECRETS = new Set([
  "",
  "hok_dev_password",
  "hok_local_app_password",
  "hok_local_root_password",
  "replace-with-a-long-random-app-password",
  "replace-with-a-long-random-root-password"
]);

function integer(
  value,
  fallback,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}
) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

const written = value => String(value ?? "").trim();

/**
 * The settings of the translator. The service is the one TRANSLATION_PROVIDER names, else DeepL when
 * a DeepL key is there, else none. The key is TRANSLATION_API_KEY, or DEEPL_API_KEY for DeepL (never
 * for another service: a DeepL key is not one of theirs). There is no daily limit unless one is
 * written: DeepL says how much of its quota is left, and the other services have a default.
 */
function translationSettings(env) {
  const deeplKey = written(env.DEEPL_API_KEY);
  const provider = written(env.TRANSLATION_PROVIDER) || (deeplKey ? "deepl" : "off");
  return {
    provider,
    apiKey: written(env.TRANSLATION_API_KEY) || (provider === "deepl" ? deeplKey : ""),
    endpoint: written(env.TRANSLATION_ENDPOINT),
    model: written(env.TRANSLATION_MODEL),
    dailyChars: written(env.TRANSLATION_DAILY_CHARS)
      ? integer(env.TRANSLATION_DAILY_CHARS, null, { min: 0, max: 100_000_000 })
      : null,
    sweepSeconds: integer(env.TRANSLATION_SWEEP_SECONDS, 300, { min: 10, max: 86_400 })
  };
}

function parseTrustProxy(value) {
  if (value === undefined || value === "" || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value; // subnet list or keyword understood by Express ("loopback", "10.0.0.0/8", ...)
}

/**
 * TLS towards the database (DB_SSL=true), for a database that is not on this machine: the password and every row would
 * cross the network in clear text otherwise. TLS 1.3 only (a server that cannot speak it is refused, not downgraded to),
 * and the certificate of the server is always checked (there is no way to switch that off); DB_SSL_CA holds the certificate authority of a provider whose certificate the system does not know
 * (a PEM text; `\n` written as two characters is accepted, a configuration variable is often one line).
 */
function databaseTls(env) {
  if (written(env.DB_SSL) !== "true") {
    return null;
  }
  const ca = written(env.DB_SSL_CA).replace(/\\n/g, "\n");
  return { rejectUnauthorized: true, minVersion: "TLSv1.3", ...(ca ? { ca } : {}) };
}

/**
 * The database as one address, `mysql://user:password@host:port/name`: DB_URL, or JAWSDB_URL that the Heroku add-on sets.
 * Each DB_ setting that is written still wins over its part of the address. Not a MySQL address: refused at start.
 */
function databaseAddress(env) {
  const raw = written(env.DB_URL) || written(env.JAWSDB_URL);
  if (!raw) {
    return {};
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "DB_URL / JAWSDB_URL is not an address of the form mysql://user:password@host:port/name."
    );
  }
  if (url.protocol !== "mysql:") {
    throw new Error("DB_URL / JAWSDB_URL must start with mysql:// (this application uses MySQL).");
  }
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1))
  };
}

/** A database on this machine or on a private network (a name without a dot is a service of a Docker network). */
export function isLocalDatabaseHost(host) {
  return (
    !host.includes(".") ||
    host === "host.docker.internal" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  );
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const production = nodeEnv === "production";
  const address = databaseAddress(env);
  const detailsDelayFallback = production ? 60 : 600; // seconds
  const googleEnabled = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
  );
  return {
    nodeEnv,
    production,
    port: integer(env.PORT, 3000, { min: 0, max: 65535 }),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    appOrigin: env.APP_ORIGIN || null,
    // Secure cookies by default in production; set COOKIE_SECURE=false explicitly for plain-http
    // local use.
    cookieSecure:
      env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === ""
        ? production
        : env.COOKIE_SECURE === "true",
    db: {
      host: env.DB_HOST || address.host || "127.0.0.1",
      port: integer(env.DB_PORT || address.port, 8080, { min: 1, max: 65535 }),
      user: env.DB_USER || address.user || "hok_app",
      password: env.DB_PASSWORD || address.password || "",
      database: env.DB_NAME || address.database || "hok_scrim",
      // The pool of connections (see docs/PERFORMANCE.md). One process rarely needs more than ten:
      // the connections of ALL the instances together must stay under MySQL's max_connections (151 by
      // default). A queue limit above 0 makes a request fail at once when that many are already waiting,
      // instead of waiting for ever behind a database that is not answering.
      connectionLimit: integer(env.DB_POOL_SIZE, 10, { min: 1, max: 100 }),
      queueLimit: integer(env.DB_QUEUE_LIMIT, 0, { min: 0, max: 100_000 }),
      connectTimeout: integer(env.DB_CONNECT_TIMEOUT_MS, 10_000, { min: 500, max: 120_000 }),
      ...(databaseTls(env) ? { ssl: databaseTls(env) } : {})
    },
    google: {
      enabled: googleEnabled,
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: env.GOOGLE_REDIRECT_URI || ""
    },
    // Discord is optional: linking an account needs the first three, sending direct messages needs
    // the bot token.
    discord: {
      clientId: env.DISCORD_CLIENT_ID || "",
      clientSecret: env.DISCORD_CLIENT_SECRET || "",
      redirectUri: env.DISCORD_REDIRECT_URI || "",
      botToken: env.DISCORD_BOT_TOKEN || "",
      publicKey: env.DISCORD_PUBLIC_KEY || "",
      botRedirectUri:
        env.DISCORD_BOT_REDIRECT_URI ||
        (env.DISCORD_REDIRECT_URI
          ? env.DISCORD_REDIRECT_URI.replace(
              /\/auth\/discord\/callback$/,
              "/auth/discord/bot/callback"
            )
          : "")
    },
    adminEmails: new Set(
      String(env.ADMIN_EMAILS || "")
        .split(",")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
    ),
    minSampleGames: integer(env.MIN_SAMPLE_GAMES, 30, { min: 1, max: 1000 }),
    rateLimitEnabled: env.RATE_LIMIT_DISABLED !== "true",
    rosterManualCooldownMs: integer(env.ROSTER_SYNC_COOLDOWN_SECONDS, 600, { min: 0 }) * 1000,
    rosterSyncIntervalMs: 12 * 60 * 60 * 1000,
    // Server-side rendering of the first screen (headless Chromium runs the site once per page and
    // language). On in production.
    prerender: env.PRERENDER ? env.PRERENDER === "true" : env.NODE_ENV === "production",
    // The start-up warm-up draws the public pages in English only, unless asked (every language in production): about 150
    // renders in a row would keep a small development machine (a Docker VM with 2 GB) busy for many minutes.
    prerenderWarmAllLanguages: env.PRERENDER_WARM_ALL
      ? env.PRERENDER_WARM_ALL === "true"
      : production,
    // The Camp sheet crawl waits this long after start-up (10 minutes in development, so that it does not share the machine
    // with the warm-up and the first visits).
    detailsSyncStartupDelayMs:
      (env.DETAILS_SYNC_STARTUP_DELAY_SECONDS
        ? integer(env.DETAILS_SYNC_STARTUP_DELAY_SECONDS, detailsDelayFallback, {
            min: 0,
            max: 86_400
          })
        : detailsDelayFallback) * 1000, // a variable left empty (docker compose) is not set
    registrationEnabled: env.REGISTRATION_ENABLED !== "false",
    passwordPepper: env.PASSWORD_PEPPER || "",
    mfaKey: env.MFA_ENCRYPTION_KEY || "",
    mfaKeyFile: env.MFA_KEY_FILE || ".data/mfa.key",
    scryptLog2N: integer(env.SCRYPT_LOG2N, 17, { min: 10, max: 20 }),
    authIssuer: env.AUTH_ISSUER || "HOK Global Scrim Lab",
    exportConcurrency: integer(env.EXPORT_CONCURRENCY, 1, { min: 1, max: 4 }),
    exportMaxQueued: integer(env.EXPORT_MAX_QUEUED, 4, { min: 0, max: 50 }),
    portraitCacheDir: env.PORTRAIT_CACHE_DIR || "",
    // behind a load balancer: seconds between "this instance is leaving" (readiness answers 503) and
    // the moment it stops listening; 0 (the default) for a single instance
    shutdownDrainMs: integer(env.SHUTDOWN_DRAIN_SECONDS, 0, { min: 0, max: 120 }) * 1000,
    // The automatic translation of what the staff writes (see features/translations): off until a
    // key is given. A DeepL key alone turns DeepL on (DEEPL_API_KEY); TRANSLATION_PROVIDER chooses
    // another service, or `off`. Nothing is sent anywhere while it is off.
    translation: translationSettings(env)
  };
}

/** Throws with a list of problems (never the secret values themselves). */
export function assertRuntimeConfig(config) {
  const problems = [];
  if (!config.db.password) {
    problems.push("DB_PASSWORD is not set (copy .env.example to .env).");
  }
  if (config.production) {
    if (KNOWN_DEFAULT_SECRETS.has(config.db.password) || config.db.password.length < 12) {
      problems.push("DB_PASSWORD is a known default or shorter than 12 characters.");
    }
    if (!config.db.ssl && !isLocalDatabaseHost(config.db.host)) {
      problems.push(
        "DB_HOST is not on this machine or a private network: set DB_SSL=true (DB_SSL_CA for a provider's own authority), or the password and the data cross the network in clear text."
      );
    }
    if (!config.mfaKey) {
      problems.push(
        "MFA_ENCRYPTION_KEY is not set (32 random bytes, base64): it encrypts the authenticator seeds."
      );
    }
    if (config.scryptLog2N < 15) {
      problems.push("SCRYPT_LOG2N must be at least 15 in production.");
    }
    if (!config.cookieSecure) {
      problems.push("COOKIE_SECURE must not be false in production.");
    }
    if (config.google.enabled && !config.google.redirectUri.startsWith("https://")) {
      problems.push("GOOGLE_REDIRECT_URI must be an https:// URL in production.");
    }
  }
  const translation = config.translation;
  if (translation.provider !== "off") {
    const needs = REQUIREMENTS[translation.provider];
    if (!needs) {
      problems.push(
        `TRANSLATION_PROVIDER must be off, ${PROVIDERS.join(", ")} (it is "${translation.provider}").`
      );
    } else {
      if (needs.key && !translation.apiKey) {
        problems.push(
          `TRANSLATION_API_KEY is not set (the ${translation.provider} translation needs it).`
        );
      }
      if (needs.endpoint && !translation.endpoint) {
        problems.push(
          `TRANSLATION_ENDPOINT is not set (the address of your ${translation.provider} service).`
        );
      }
    }
  }
  if (problems.length) {
    const error = new Error(`Refusing to start (${config.nodeEnv}):\n - ${problems.join("\n - ")}`);
    error.code = "INVALID_CONFIG";
    throw error;
  }
}
