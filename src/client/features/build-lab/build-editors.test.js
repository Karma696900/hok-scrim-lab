// Who may edit the recommended builds of the heroes (the ones on the hero pages): the
// administrators, and the people an administrator gave the Contributor label to, by hand. Nobody else,
// whatever other label they hold.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

/** A small catalogue and a valid build of it (two core items), written once by an administrator. */
let written = null;
const catalogue = admin => (written ??= writeCatalogue(admin));
async function writeCatalogue(admin) {
  const id = async (path, body) => {
    const response = await admin.browser.post(path, body);
    assert.equal(response.status, 200, `${path}: ${response.text}`);
    return response.body.id;
  };
  const hp = await id("/api/admin/catalog/stats", { name: "Max HP" });
  const boots = await id("/api/admin/catalog/items", {
    name: "Swift Boots",
    category: "boots",
    stats: [{ statId: hp, value: 50 }]
  });
  const blade = await id("/api/admin/catalog/items", {
    name: "Blade",
    category: "regular",
    stats: []
  });
  return {
    items: [boots, blade],
    utility: [],
    late: [],
    core: [boots, blade],
    arcana: { red: [], blue: [], green: [] }
  };
}

const labelsOf = (admin, person, labels) =>
  admin.browser.put(`/api/admin/players/${person.user.tag}/labels`, { labels });

describe("who edits the recommended builds", { skip }, () => {
  test("an administrator, and a person with the Contributor label, nobody else", async () => {
    const admin = await app.signIn("Chief", { admin: true });
    const person = await app.signIn("Helper");
    const build = await catalogue(admin);
    const put = (who, variant = 1) =>
      who.browser.put(`/api/builds/h01/${variant}`, { name: "Burst", build });

    // before the label: the page of builds is not for this person
    assert.equal((await person.browser.get("/api/auth/me")).body.user.isEditor, false);
    assert.equal((await person.browser.put("/api/builds/h01/1", { build })).status, 403);
    assert.equal((await person.browser.get("/api/builds")).status, 403);
    assert.equal((await app.browser().get("/api/builds")).status, 401, "no session");
    assert.equal((await app.browser().put("/api/builds/h01/1", { build })).status, 401);
    assert.equal((await admin.browser.get("/api/auth/me")).body.user.isEditor, true);

    // the other labels are only labels
    assert.equal(
      (await labelsOf(admin, person, ["verified", "moderator", "organiser"])).status,
      200
    );
    assert.equal((await put(person)).status, 403);
    assert.equal((await person.browser.get("/api/auth/me")).body.user.isEditor, false);

    // the Contributor label opens it, at once
    assert.equal((await labelsOf(admin, person, ["contributor"])).status, 200);
    assert.equal((await person.browser.get("/api/auth/me")).body.user.isEditor, true);
    assert.equal((await put(person)).status, 200);
    assert.equal((await put(person, 2)).status, 200);
    const listed = (await person.browser.get("/api/builds")).body.builds.filter(
      entry => entry.heroId === "h01"
    );
    assert.deepEqual(
      listed.map(entry => [entry.variant, entry.name]),
      [
        [1, "Burst"],
        [2, "Burst"]
      ],
      "a summary of each build, without its content"
    );
    assert.ok(listed.every(entry => !("build" in entry) && entry.updatedAt > 0));
    const [[row]] = await app.store.pool.query(
      "SELECT updated_by FROM hero_build_sets WHERE hero_id = 'h01' AND variant = 1"
    );
    assert.equal(row.updated_by, person.user.id, "the build says who wrote it");
    assert.equal((await person.browser.delete("/api/builds/h01/2")).status, 200);

    // what is not about builds stays for the administrators
    assert.equal(
      (await person.browser.put("/api/admin/heroes/h01/profile", { baseStats: [], skills: [] }))
        .status,
      403
    );
    assert.equal(
      (await person.browser.post("/api/admin/catalog/stats", { name: "Attack" })).status,
      403
    );
    assert.equal((await labelsOf(person, person, ["contributor"])).status, 403);

    // taking the label away closes it, at once
    assert.equal((await labelsOf(admin, person, [])).status, 200);
    assert.equal((await put(person)).status, 403);
    assert.equal((await person.browser.delete("/api/builds/h01/1")).status, 403);
    assert.equal((await person.browser.get("/api/auth/me")).body.user.isEditor, false);
    assert.equal((await admin.browser.delete("/api/builds/h01/1")).status, 200);
  });

  test("a build is checked the same way whoever writes it", async () => {
    const admin = await app.signIn("Checker", { admin: true });
    const person = await app.signIn("Writer");
    await labelsOf(admin, person, ["contributor"]);
    const build = await catalogue(admin);
    for (const [label, body] of [
      ["one core item only", { build: { ...build, core: [build.core[0]] } }],
      ["no item, no arcana", { build: { items: [], utility: [], late: [], core: [], arcana: {} } }],
      [
        "a core item that is not in the build",
        { build: { ...build, core: [build.core[0], 99999] } }
      ]
    ]) {
      assert.equal((await person.browser.put("/api/builds/h02/1", body)).status, 400, label);
    }
    assert.equal(
      (await person.browser.put("/api/builds/h02/3", { build })).status,
      404,
      "only two builds per hero"
    );
    assert.equal((await person.browser.put("/api/builds/h77/1", { build })).status, 404);
  });
});
