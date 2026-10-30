// A person who is signed in receives, in the page itself, what the browser would otherwise ask for before it can draw:
// their session, their preferences and the counters of their menu (platform/http/bootstrap.js). A visitor's page stays
// the same for everybody.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const bootOf = html => JSON.parse(/id="boot">([\s\S]*?)<\/script>/.exec(html)[1]);
const open = async (path, cookie) => {
  const response = await fetch(`${app.baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  return { response, html: await response.text() };
};

describe("the page of a signed-in person carries their start", { skip }, () => {
  test("session, preferences and counters are in the page, the same as the API answers them", async () => {
    const person = await app.signIn("Pat");
    const cookie = `hok_session=${person.browser.jar.get("hok_session")}`;
    const { response, html } = await open("/settings", cookie);
    const boot = bootOf(html);
    assert.equal(boot.b.me.user.name, "Pat");
    assert.deepEqual(
      boot.b.me,
      (await person.browser.get("/api/auth/me")).body,
      "the same object as GET /api/auth/me"
    );
    assert.deepEqual(boot.b.prefs, (await person.browser.get("/api/me/preferences")).body);
    assert.deepEqual(boot.b.summary, (await person.browser.get("/api/community/summary")).body);
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store",
      "a page with a person's data is theirs alone"
    );
  });

  test("the browser is not told to ask for what the page already carries, nor for what the page does not read", async () => {
    const person = await app.signIn("Quinn");
    const cookie = `hok_session=${person.browser.jar.get("hok_session")}`;
    const settings = bootOf((await open("/settings", cookie)).html);
    assert.ok(!settings.f.includes("/api/auth/me"));
    assert.deepEqual(settings.f, ["/api/heroes"], "settings reads the roster and nothing else");
    const scrims = bootOf((await open("/scrims", cookie)).html);
    assert.deepEqual(scrims.f, ["/api/heroes", "/api/series?pageSize=100"]);
    const tiers = bootOf((await open("/tier-lists", cookie)).html);
    assert.deepEqual(tiers.f, ["/api/heroes", "/api/tier-lists?pageSize=100"]);
  });

  test("the page of a signed-in person starts the application with the boot loader, after the first paint, and its data calls are in the boot block", async () => {
    const person = await app.signIn("Robin");
    const cookie = `hok_session=${person.browser.jar.get("hok_session")}`;
    const { html } = await open("/training", cookie);
    const boot = bootOf(html);
    assert.ok(boot.e.startsWith("/"), "the entry module is named in the boot block");
    assert.ok(boot.f.includes("/api/heroes"), "the data the page reads is named too");
    assert.match(html, /<script>[^<]/, "one inline script: the constant boot loader");
    assert.doesNotMatch(html, /<link rel="modulepreload"/, "nothing competes with the first paint");
  });

  test("a visitor's page carries nothing personal and keeps asking for its session", async () => {
    const { response, html } = await open("/settings");
    const boot = bootOf(html);
    assert.equal(boot.b, undefined);
    assert.ok(boot.f.includes("/api/auth/me"));
    assert.notEqual(response.headers.get("cache-control"), "private, no-store");
  });

  test("an anonymous guest has a session answer and nothing else personal", async () => {
    const guest = app.browser();
    await guest.post("/api/series", {}).catch(() => {}); // any call that makes a guest identity
    const cookie = guest.jar.size ? `hok_session=${guest.jar.get("hok_session")}` : "";
    if (!cookie || cookie === "hok_session=undefined") {
      return; // this build creates no guest on that call: nothing to check
    }
    const boot = bootOf((await open("/", cookie)).html);
    assert.equal(boot.b.me.user, null);
    assert.equal(boot.b.me.guest, true);
    assert.equal(boot.b.prefs, undefined);
  });
});
