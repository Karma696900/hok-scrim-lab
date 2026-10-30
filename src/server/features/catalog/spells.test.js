// The spells a player takes into a match (Flash, Heal...): a catalogue written by the staff like the items,
// and up to two of them in a build (the lab, the shared link, the recommended builds of the heroes).
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  SPELLS_MAX,
  checkBuild,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  shapeBuild
} from "../../../shared/build-model.js";
import { parseSpell } from "./catalog-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const known = { imageIds: new Set(["pic"]) };
const statusOf = fn => {
  try {
    fn();
  } catch (error) {
    return error.status;
  }
  return null;
};

describe("spells in a build (pure)", () => {
  const catalog = {
    stats: [],
    tags: [],
    items: [{ id: 1, name: "Blade", category: "regular" }],
    arcana: [],
    spells: [
      { id: 7, name: "Flash" },
      { id: 8, name: "Heal" },
      { id: 9, name: "Stun" }
    ]
  };

  test("a build has up to two, one or none; a third or an unknown one is a problem", () => {
    assert.equal(SPELLS_MAX, 2);
    assert.deepEqual(checkBuild({ items: [1], spells: [7] }, catalog).build.spells, [7]);
    assert.deepEqual(checkBuild({ items: [1], spells: [7, 8] }, catalog).problems, []);
    assert.equal(checkBuild({ items: [1], spells: [7, 8, 9] }, catalog).problems.length, 1);
    assert.equal(checkBuild({ items: [1], spells: [99] }, catalog).problems.length, 1);
    assert.equal(checkBuild({ items: [1], spells: [7, 7] }, catalog).problems.length, 1);
    assert.deepEqual(checkBuild({ items: [1] }, catalog).build.spells, [], "a build without any");
    assert.deepEqual(emptyBuild().spells, []);
  });

  test("a catalogue from before spells (no `spells` key) still checks builds", () => {
    const old = { ...catalog };
    delete old.spells;
    assert.equal(checkBuild({ items: [1] }, old).problems.length, 0);
    assert.equal(checkBuild({ items: [1], spells: [7] }, old).problems.length, 1);
  });

  test("shaping keeps whole ids, at most two, once each; the address keeps them (s=)", () => {
    assert.deepEqual(shapeBuild({ spells: [7, 7, 8, 9, "x", -1] }).spells, [7, 8]);
    assert.deepEqual(shapeBuild({}).spells, [], "a build written before spells");
    const build = { ...emptyBuild(), items: [1], spells: [8, 7] };
    const params = encodeBuild(build);
    assert.equal(params.get("s"), "8.7");
    assert.deepEqual(decodeBuild(params).spells, [8, 7]);
    assert.equal(encodeBuild(emptyBuild()).has("s"), false, "nothing in the address when none");
  });
});

describe("parseSpell", () => {
  test("a name is needed; the two numbers are optional and bounded; nothing is guessed", () => {
    assert.deepEqual(parseSpell({ name: " Flash " }, known), {
      name: "Flash",
      imageId: null,
      description: "",
      cooldownSeconds: null,
      unlockLevel: null
    });
    const full = parseSpell(
      {
        name: "Heal",
        imageId: "pic",
        description: "Restores health.",
        cooldownSeconds: 120,
        unlockLevel: 1
      },
      known
    );
    assert.equal(full.cooldownSeconds, 120);
    assert.equal(full.unlockLevel, 1);
    assert.equal(
      statusOf(() => parseSpell({ name: "" }, known)),
      400
    );
    assert.equal(
      statusOf(() => parseSpell({ name: "A", cooldownSeconds: -1 }, known)),
      400
    );
    assert.equal(
      statusOf(() => parseSpell({ name: "A", cooldownSeconds: 4000 }, known)),
      400
    );
    assert.equal(
      statusOf(() => parseSpell({ name: "A", unlockLevel: 16 }, known)),
      400
    );
    assert.equal(
      statusOf(() => parseSpell({ name: "A", imageId: "nope" }, known)),
      400
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("spells through the API", { skip }, () => {
  test("administrators write them, everybody reads them in the catalogue", async () => {
    const admin = await app.signIn("Spellsmith", { admin: true });
    const plain = await app.signIn("Plain");
    assert.equal(
      (await plain.browser.post("/api/admin/catalog/spells", { name: "Nope" })).status,
      403
    );
    assert.equal(
      (await app.browser().post("/api/admin/catalog/spells", { name: "Nope" })).status,
      401
    );

    const created = await admin.browser.post("/api/admin/catalog/spells", {
      name: "Flash",
      description: "Teleports a short distance.",
      cooldownSeconds: 120,
      unlockLevel: 1
    });
    assert.equal(created.status, 200, created.text);
    const id = created.body.id;
    assert.equal(
      (await admin.browser.post("/api/admin/catalog/spells", { name: "Flash" })).status,
      409,
      "a name once"
    );
    const seen = (await app.browser().get("/api/catalog")).body.spells;
    assert.deepEqual(
      seen.find(spell => spell.id === id),
      {
        id,
        name: "Flash",
        imageId: null,
        description: "Teleports a short distance.",
        cooldownSeconds: 120,
        unlockLevel: 1
      }
    );

    assert.equal(
      (
        await admin.browser.put(`/api/admin/catalog/spells/${id}`, {
          name: "Flash",
          cooldownSeconds: 90
        })
      ).status,
      200
    );
    const edited = (await app.browser().get("/api/catalog")).body.spells.find(
      spell => spell.id === id
    );
    assert.equal(edited.cooldownSeconds, 90);
    assert.equal(edited.unlockLevel, null, "what is not sent is emptied, like the other editors");
    assert.equal(
      (await admin.browser.put("/api/admin/catalog/spells/999999", { name: "X" })).status,
      404
    );
    assert.equal((await admin.browser.delete(`/api/admin/catalog/spells/${id}`)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/spells/${id}`)).status, 404);
  });

  test("a recommended build keeps one or two spells, and a spell in use cannot be deleted", async () => {
    const admin = await app.signIn("Builder", { admin: true });
    const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
    const flash = await post("/api/admin/catalog/spells", { name: "Flash B" });
    const heal = await post("/api/admin/catalog/spells", { name: "Heal B" });
    const stun = await post("/api/admin/catalog/spells", { name: "Stun B" });
    const blade = await post("/api/admin/catalog/items", {
      name: "Blade B",
      category: "regular",
      stats: []
    });
    const boots = await post("/api/admin/catalog/items", {
      name: "Boots B",
      category: "boots",
      stats: []
    });
    const build = {
      items: [boots, blade],
      utility: [],
      late: [],
      core: [boots, blade],
      arcana: {}
    };
    const put = body => admin.browser.put("/api/builds/h03/1", { name: "Spelled", build: body });

    assert.equal((await put({ ...build, spells: [flash] })).status, 200, "one");
    assert.equal((await put({ ...build, spells: [flash, heal] })).status, 200, "two");
    assert.equal((await put({ ...build, spells: [flash, heal, stun] })).status, 400, "three");
    assert.equal((await put({ ...build, spells: [123456] })).status, 400, "unknown");
    assert.equal((await put({ ...build, spells: [flash, flash] })).status, 400, "twice");
    assert.equal((await put({ ...build, spells: [flash, heal] })).status, 200);
    const read = (await app.browser().get("/api/heroes/h03")).body;
    assert.deepEqual(read.builds?.[0]?.build?.spells ?? read.build?.spells, [flash, heal]);

    const refused = await admin.browser.delete(`/api/admin/catalog/spells/${flash}`);
    assert.equal(refused.status, 409, "used by a recommended build");
    assert.equal(
      (await admin.browser.delete(`/api/admin/catalog/spells/${stun}`)).status,
      200,
      "not used"
    );
    // a build written before spells has none, and is still valid
    assert.equal((await put(build)).status, 200);
    assert.equal((await admin.browser.delete(`/api/admin/catalog/spells/${flash}`)).status, 200);
  });
});

describe("the pages of the data of the game", { skip }, () => {
  test("/items, /arcana and /spells are public pages with their own title, and are in the sitemap", async () => {
    for (const [path, word] of [
      ["/items", "items"],
      ["/arcana", "arcana"],
      ["/spells", "spells"]
    ]) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, new RegExp(`<title>[^<]*${word}[^<]*</title>`, "i"), path);
    }
    const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    for (const path of ["/items", "/arcana", "/spells"]) {
      assert.ok(sitemap.includes(`${path}</loc>`), `${path} is in the sitemap`);
    }
  });
});
