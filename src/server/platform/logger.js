// Minimal JSON-lines logger. Sensitive keys are always redacted.

const SENSITIVE = /cookie|authorization|token|secret|password|session|code_verifier|^code$/i;

function redact(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 3) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => redact(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE.test(key) ? "[redacted]" : redact(item, depth + 1)
    ])
  );
}

export function createLogger({
  level = process.env.LOG_LEVEL || "info",
  sink = line => process.stdout.write(`${line}\n`)
} = {}) {
  const order = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = order[level] ?? order.info;
  const write = (name, message, meta = {}) => {
    if (order[name] < threshold) {
      return;
    }
    sink(
      JSON.stringify({ ts: new Date().toISOString(), level: name, msg: message, ...redact(meta) })
    );
  };
  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}

export const logger = createLogger();
