// The other names of a hero: how a name becomes a key, and what an administrator can do with them.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { heroNameKey } from "../../../shared/vod-model.js";
import { startTestServer } from "../../../testing/test-app.js";

describe("the key a hero name is matched by", () => {
  test("lower case letters and digits only, as the import script reads names", () => {
    assert.equal(heroNameKey("Sun Ce"), "sunce");
    assert.equal(heroNameKey("  Zhuge   Liang "), "zhugeliang");
    assert.equal(heroNameKey("Mèlissa"), "melissa");
    assert.equal(heroNameKey("Gong-Sun Li"), "gongsunli");
    assert.equal(heroNameKey(""), "");
  });
  test("a note in brackets is not part of the name, except for the Flowborn forms", () => {
    assert.equal(heroNameKey("Marco Polo (HoK)"), "marcopolo");
    assert.equal(heroNameKey("Flowborn (Mage)"), "flowbornmage");
  });
  test("a long name ending in hok loses it", () => {
    assert.equal(heroNameKey("Marco Polo HoK"), "marcopolo");
    assert.equal(heroNameKey("Wu Hok"), "wuhok");
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("other names of a hero (admin only)", { skip }, () => {
  test("only an administrator reads or changes them", async () => {
    const plain = await app.signIn("PlainAlias");
    assert.equal((await plain.browser.get("/api/admin/heroes/h01/aliases")).status, 403);
    assert.equal(
      (await plain.browser.post("/api/admin/heroes/h01/aliases", { alias: "Nickname" })).status,
      403
    );
    assert.equal(
      (await plain.browser.delete("/api/admin/heroes/h01/aliases/nickname")).status,
      403
    );
  });

  test("an administrator adds a name, sees it back, and takes it away", async () => {
    const admin = await app.signIn("AdminAlias", { admin: true });
    const added = await admin.browser.post("/api/admin/heroes/h01/aliases", {
      alias: "  Le Grand Nom "
    });
    assert.equal(added.status, 200);
    assert.deepEqual(
      { alias: added.body.alias, key: added.body.key },
      { alias: "Le Grand Nom", key: "legrandnom" }
    );
    const listed = await admin.browser.get("/api/admin/heroes/h01/aliases");
    assert.deepEqual(listed.body.aliases, [{ alias: "Le Grand Nom", key: "legrandnom" }]);
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h01/aliases/legrandnom")).status,
      200
    );
    assert.deepEqual((await admin.browser.get("/api/admin/heroes/h01/aliases")).body.aliases, []);
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h01/aliases/legrandnom")).status,
      404
    );
  });

  test("one name names one hero only, and never the name of a hero", async () => {
    const admin = await app.signIn("AdminAlias2", { admin: true });
    const heroes = (await admin.browser.get("/api/heroes")).body.heroes;
    const own = heroes.find(hero => hero.id === "h02").name;
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h02/aliases", { alias: "Shared" })).status,
      200
    );
    // the same key on another hero, typed another way
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h03/aliases", { alias: "SHARED!" })).status,
      400
    );
    // the name of a hero, as another name of that hero, or of another one
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h02/aliases", { alias: own })).status,
      400
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h03/aliases", { alias: own })).status,
      400
    );
    // what cannot make a key
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h02/aliases", { alias: "!!" })).status,
      400
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h02/aliases", { alias: "x" })).status,
      400
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/nope/aliases", { alias: "Anything" })).status,
      404
    );
    await admin.browser.delete("/api/admin/heroes/h02/aliases/shared");
  });
});
