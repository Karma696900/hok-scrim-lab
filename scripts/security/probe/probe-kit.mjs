// What every group of checks of the vulnerability probe shares: the address, the request that never throws, the list
// of results.

/**
 * `forwardedProto`: a site in production answers plain http with a redirect to https and is reached through a proxy that
 * ends TLS; PROBE_FORWARDED_PROTO=https makes every request say so, the way that proxy does.
 * `rateLimitDisabled`: the instance has its limits switched off on purpose (a test instance).
 */
export function createProbe({ base, forwardedProto = "", rateLimitDisabled = false }) {
  const results = [];
  const check = (group, label, ok, detail = "") => results.push({ group, label, ok, detail });

  /** The `code` of an error answer, or null when the answer is not JSON. */
  const codeOf = text => {
    try {
      return JSON.parse(text).code ?? null;
    } catch {
      return null;
    }
  };

  /**
   * A request that never follows a redirect and never throws: { status, headers, text }. `plain` leaves out the
   * header of the proxy (what a client that reaches the server directly over http sends).
   */
  async function send(
    path,
    { method = "GET", headers = {}, body, raw = false, plain = false } = {}
  ) {
    try {
      const response = await fetch(raw ? path : `${base}${path}`, {
        method,
        headers:
          forwardedProto && !plain ? { "x-forwarded-proto": forwardedProto, ...headers } : headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000)
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      return { status: 0, headers: new Headers(), text: String(error.message) };
    }
  }

  return { base, forwardedProto, rateLimitDisabled, results, check, codeOf, send };
}
