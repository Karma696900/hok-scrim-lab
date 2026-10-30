// Onboarding and settings: the parts of the site a person wants in their menu (the community is not
// in the list: it is always on), and their settings (defaults for a new series, start page, reduced
// motion).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { DEFAULT_SETTINGS, MODULES, parsePreferences, parseSettings } from "./preference-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

describe("preferences (pure)", () => {
  test("only known optional parts, once each, in a fixed order", () => {
    assert.deepEqual(parsePreferences({ modules: ["training", "scrims", "training"] }).modules, [
      "scrims",
      "training"
    ]);
    assert.deepEqual(
      parsePreferences({ modules: [] }).modules,
      [],
      "a person may switch every optional part off"
    );
    assert.throws(
      () => parsePreferences({ modules: ["community"] }),
      /Unknown part/,
      "the community is not optional, so it cannot be chosen"
    );
    assert.throws(() => parsePreferences({ modules: ["nope"] }), /Unknown part/);
    assert.throws(() => parsePreferences({}), /list/);
    assert.throws(() => parsePreferences({ modules: "scrims" }), /list/);
    assert.deepEqual(MODULES, ["scrims", "tier-lists", "heroes", "training"]);
  });

  test("settings: known choices only, a missing field keeps its value", () => {
    assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
    assert.deepEqual(
      parseSettings(
        { bestOf: 5, gameMode: "classic", reduceMotion: true },
        { ...DEFAULT_SETTINGS, startPage: "/training" }
      ),
      {
        bestOf: 5,
        gameMode: "classic",
        draftMode: "solo",
        startPage: "/training",
        reduceMotion: true
      }
    );
    for (const bad of [
      { bestOf: 4 },
      { gameMode: "ranked" },
      { draftMode: "robot" },
      { startPage: "/admin" },
      { startPage: "https://evil.example" },
      { reduceMotion: "yes" },
      { theme: "blue" },
      { direction: "up" }
    ]) {
      assert.throws(() => parseSettings(bad), /supported choice|true or false/);
    }
    assert.throws(() => parseSettings([]), /object/);
  });

  test("the theme and the text direction are settings too, and stay out of the defaults", () => {
    assert.equal("theme" in DEFAULT_SETTINGS, false);
    assert.equal("direction" in DEFAULT_SETTINGS, false);
    assert.deepEqual(parseSettings({ theme: "light", direction: "rtl" }), {
      ...DEFAULT_SETTINGS,
      theme: "light",
      direction: "rtl"
    });
    assert.equal(parseSettings({ direction: "auto" }).direction, "auto");
  });

  test("a request with settings only leaves the parts as they are", () => {
    assert.deepEqual(
      parsePreferences({ settings: { bestOf: 7 } }).modules,
      undefined,
      "settings alone leave the parts as they are"
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("preferences over HTTP", { skip }, () => {
  test("a new account has everything on and has not been through the welcome pages; choices are kept per account", async () => {
    const a = await app.signIn("PrefA", { onboarded: false });
    const b = await app.signIn("PrefB", { onboarded: false });
    assert.equal((await app.browser().get("/api/me/preferences")).status, 401);
    assert.deepEqual((await a.browser.get("/api/me/preferences")).body, {
      modules: MODULES,
      onboarded: false,
      settings: DEFAULT_SETTINGS
    });

    const saved = await a.browser.put("/api/me/preferences", { modules: ["heroes", "scrims"] });
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual(saved.body, {
      modules: ["scrims", "heroes"],
      onboarded: true,
      settings: DEFAULT_SETTINGS
    });
    assert.deepEqual((await a.browser.get("/api/me/preferences")).body.modules, [
      "scrims",
      "heroes"
    ]);
    assert.deepEqual(
      (await b.browser.get("/api/me/preferences")).body,
      { modules: MODULES, onboarded: false, settings: DEFAULT_SETTINGS },
      "another account is untouched"
    );

    assert.equal(
      (await a.browser.put("/api/me/preferences", { modules: ["community"] })).status,
      400
    );
    assert.equal((await a.browser.put("/api/me/preferences", {})).status, 400);
    assert.deepEqual(
      (await a.browser.get("/api/me/preferences")).body.modules,
      ["scrims", "heroes"],
      "a refused change changes nothing"
    );

    assert.equal((await a.browser.put("/api/me/preferences", { modules: [] })).status, 200);
    assert.deepEqual((await a.browser.get("/api/me/preferences")).body.modules, []);
  });

  test("settings are saved on their own, merged with what was stored, and the parts are not touched", async () => {
    const a = await app.signIn("SetA");
    await a.browser.put("/api/me/preferences", { modules: ["training"] });
    const first = await a.browser.put("/api/me/preferences", {
      settings: { bestOf: 5, startPage: "/training" }
    });
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.body.modules, ["training"], "the parts are untouched");
    assert.deepEqual(first.body.settings, {
      ...DEFAULT_SETTINGS,
      bestOf: 5,
      startPage: "/training"
    });
    const second = await a.browser.put("/api/me/preferences", {
      settings: { gameMode: "classic", reduceMotion: true }
    });
    assert.deepEqual(
      second.body.settings,
      {
        ...DEFAULT_SETTINGS,
        bestOf: 5,
        startPage: "/training",
        gameMode: "classic",
        reduceMotion: true
      },
      "an earlier setting is kept"
    );
    assert.equal(
      (await a.browser.put("/api/me/preferences", { settings: { startPage: "/admin" } })).status,
      400
    );
    assert.deepEqual(
      (await a.browser.get("/api/me/preferences")).body.settings.startPage,
      "/training",
      "a refused change changes nothing"
    );
  });
});
