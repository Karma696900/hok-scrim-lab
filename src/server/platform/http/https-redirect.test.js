// The redirect of plain http to https (enforceHttps), and the one visitor it must let through: the page
// renderer, which asks this same server over http (http://127.0.0.1:<port>) with the secret it keeps.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PRERENDER_HEADER } from "./prerender-parts.js";
import { enforceHttps } from "./security-headers.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

/** Runs the middleware on a request; says whether it let it through or where it sent it. */
function run(middleware, { secure = false, path = "/heroes", headers = {} } = {}) {
  const outcome = { passed: false, redirected: null };
  middleware(
    { secure, path, originalUrl: path, headers, get: () => "example.test" },
    {
      redirect: (status, location) => {
        outcome.redirected = [status, location];
      }
    },
    () => {
      outcome.passed = true;
    }
  );
  return outcome;
}

describe("plain http in production", () => {
  test("is sent to https for good, with the same address", () => {
    const { redirected, passed } = run(enforceHttps(true), { path: "/heroes?x=1" });
    assert.equal(passed, false);
    assert.deepEqual(redirected, [308, "https://example.test/heroes?x=1"]);
  });

  test("is left alone where cookies are not Secure, over https, and for the health check", () => {
    assert.equal(run(enforceHttps(false)).passed, true);
    assert.equal(run(enforceHttps(true), { secure: true }).passed, true);
    assert.equal(run(enforceHttps(true), { path: "/api/health" }).passed, true);
  });
});

describe("the page renderer, which asks the server over http from inside", () => {
  const renderer = { token: TOKEN };

  test("is let in with its secret: otherwise the first screen is never drawn in production", () => {
    const { passed, redirected } = run(enforceHttps(true, renderer), {
      headers: { [PRERENDER_HEADER]: TOKEN }
    });
    assert.equal(passed, true);
    assert.equal(redirected, null);
  });

  test("anyone else is still sent to https: no header, a wrong secret, or an empty one", () => {
    for (const headers of [{}, { [PRERENDER_HEADER]: "wrong" }, { [PRERENDER_HEADER]: "" }]) {
      const { passed, redirected } = run(enforceHttps(true, renderer), { headers });
      assert.equal(passed, false, JSON.stringify(headers));
      assert.equal(redirected?.[0], 308);
    }
  });

  test("with no renderer (it is switched off) a header lets nobody in, not even an undefined secret", () => {
    for (const renderers of [null, {}, { token: "" }]) {
      for (const headers of [{ [PRERENDER_HEADER]: TOKEN }, {}]) {
        const { passed } = run(enforceHttps(true, renderers), { headers });
        assert.equal(passed, false, JSON.stringify([renderers, headers]));
      }
    }
  });
});
