// The personal space: the builds kept on an account, and the links that share the space (tier lists,
// builds, training sheet) read only, without an account. The token is given once, only its hash is
// kept, and it travels in the body of a request.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  BUILDS_PER_HERO_MAX,
  LINKS_MAX,
  parseBuild,
  parseLink,
  parseToken
} from "./space-domain.js";
import { hashToken } from "../sharing/sharing-domain.js";
import { startTestServer } from "../../../testing/test-app.js";

const heroes = new Set(["h01", "h02", "h03"]);
const refuses = (build, code = "invalid_body") =>
  assert.throws(build, error => error.code === code);
const build = (extra = {}) => ({
  items: [11, 12, 13],
  utility: [],
  late: [],
  core: [11, 12],
  arcana: { red: [{ id: 5, count: 4 }], blue: [], green: [] },
  ...extra
});
const entry = (extra = {}) => ({
  heroId: "h01",
  name: "Burst",
  level: 15,
  build: build(),
  ...extra
});

describe("a build to keep (pure)", () => {
  test("a hero of the roster or none, a name, a level, a build with something in it", () => {
    assert.deepEqual(parseBuild(entry({ name: "  Burst  ", level: 9 }), heroes), {
      heroId: "h01",
      name: "Burst",
      level: 9,
      build: parseBuild(entry(), heroes).build
    });
    assert.equal(parseBuild(entry({ heroId: "" }), heroes).heroId, "", "a build without a hero");
    assert.equal(
      parseBuild({ build: build() }, heroes).level,
      15,
      "the level defaults to the highest"
    );
    refuses(() => parseBuild(entry({ heroId: "h99" }), heroes));
    refuses(() => parseBuild(entry({ heroId: "../x" }), heroes));
    refuses(() => parseBuild(entry({ heroId: 7 }), heroes));
    refuses(() => parseBuild(entry({ level: 16 }), heroes));
    refuses(() => parseBuild(entry({ level: 0 }), heroes));
    refuses(() => parseBuild(entry({ name: "x".repeat(61) }), heroes));
    refuses(() => parseBuild(entry({ build: build({ items: [], arcana: {} }) }), heroes));
    refuses(() => parseBuild(null, heroes));
  });

  test("what is not a whole id is dropped, as in the lab; more than a build holds is cut", () => {
    const shaped = parseBuild(
      entry({
        build: build({
          items: [1, 2.5, "3", -4, 5, 6, 7, 8, 9, 10, 11],
          arcana: {
            red: [
              { id: 5, count: 0 },
              { id: 6, count: 2 }
            ],
            blue: "x"
          }
        })
      }),
      heroes
    ).build;
    assert.deepEqual(shaped.items, [1, 5, 6, 7, 8, 9], "six items at most, whole ids only");
    assert.deepEqual(shaped.arcana.red, [{ id: 6, count: 2 }]);
    assert.deepEqual(shaped.arcana.blue, []);
  });
});

describe("a link to give (pure)", () => {
  const now = Date.UTC(2026, 9, 7);
  test("at least one part, each once, a name, a lifetime or none", () => {
    assert.deepEqual(parseLink({ sections: ["training", "builds"], label: " Coach " }, now), {
      label: "Coach",
      sections: ["builds", "training"],
      expiresAt: null
    });
    assert.equal(
      parseLink({ sections: ["tierLists"], days: 7 }, now).expiresAt,
      now + 7 * 86_400_000
    );
    assert.equal(parseLink({ sections: ["tierLists"], days: null }, now).expiresAt, null);
    refuses(() => parseLink({ sections: [] }, now));
    refuses(() => parseLink({}, now));
    refuses(() => parseLink({ sections: ["builds", "builds"] }, now));
    refuses(() => parseLink({ sections: ["everything"] }, now));
    refuses(() => parseLink({ sections: ["builds"], days: 5 }, now));
    refuses(() => parseLink({ sections: ["builds"], label: "x".repeat(61) }, now));
  });

  test("a token has the shape of the ones that are given, nothing else is looked up", () => {
    assert.equal(
      parseToken({ token: "sp_abcdefghijklmnopqrstuvwxyz0123" }),
      "sp_abcdefghijklmnopqrstuvwxyz0123"
    );
    for (const token of [
      "",
      "sp_",
      "sp_short",
      "t_abcdefghijklmnopqrstuvwxyz0123",
      "sp_a b",
      12,
      null
    ]) {
      refuses(() => parseToken({ token }));
    }
    refuses(() => parseToken(null));
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const open = (browser, token) => browser.post("/api/space/open", { token });

describe("the builds kept on an account", { skip }, () => {
  test("an account keeps them, lists them, removes them; nobody else sees them", async () => {
    const ana = await app.signIn("SpaceAna");
    const ben = await app.signIn("SpaceBen");
    assert.equal((await app.browser().get("/api/space")).status, 401, "no session");
    assert.equal((await app.browser().post("/api/space/builds", entry())).status, 401);

    const empty = (await ana.browser.get("/api/space")).body;
    assert.deepEqual([empty.builds, empty.links, empty.tierLists], [[], [], []]);
    assert.equal(empty.training.focus.length, 0);
    assert.deepEqual(empty.limits.days, [7, 30, 90]);

    const first = await ana.browser.post("/api/space/builds", entry());
    assert.equal(first.status, 200, first.text);
    assert.deepEqual([first.body.heroId, first.body.name, first.body.level], ["h01", "Burst", 15]);
    assert.match(first.body.id, /^[0-9a-f-]{36}$/);
    await ana.browser.post("/api/space/builds", entry({ heroId: "", name: "Items only" }));
    const listed = (await ana.browser.get("/api/space")).body.builds;
    assert.deepEqual(
      listed.map(item => item.name),
      ["Items only", "Burst"],
      "the latest first"
    );
    assert.deepEqual(listed[1].build.items, [11, 12, 13]);
    assert.deepEqual((await ben.browser.get("/api/space")).body.builds, [], "personal");

    assert.equal(
      (await ana.browser.post("/api/space/builds", entry({ heroId: "h99" }))).status,
      400
    );
    assert.equal(
      (
        await ana.browser.post(
          "/api/space/builds",
          entry({ build: build({ items: [], arcana: {} }) })
        )
      ).status,
      400
    );
    assert.equal(
      (await ben.browser.delete(`/api/space/builds/${first.body.id}`)).status,
      404,
      "not his"
    );
    assert.equal((await ana.browser.delete(`/api/space/builds/${first.body.id}`)).status, 200);
    assert.equal((await ana.browser.delete(`/api/space/builds/${first.body.id}`)).status, 404);
    assert.equal((await ana.browser.delete("/api/space/builds/not-an-id")).status, 400);
    assert.equal((await ana.browser.get("/api/space")).body.builds.length, 1);
  });

  test("a guest has no space to keep builds in", async () => {
    const guest = app.browser();
    await guest.post("/api/tier-lists", { name: "Guest list", tiers: [], unranked: [] }); // a guest identity now exists
    assert.equal((await guest.post("/api/space/builds", entry())).status, 401);
    assert.equal((await guest.get("/api/space")).status, 401);
  });

  test("at most thirty for a hero and three hundred in all, counted for the account", async () => {
    const cal = await app.signIn("SpaceCal");
    const dee = await app.signIn("SpaceDee");
    for (let index = 0; index < BUILDS_PER_HERO_MAX; index += 1) {
      assert.equal(
        (await cal.browser.post("/api/space/builds", entry({ name: `Build ${index}` }))).status,
        200
      );
    }
    const over = await cal.browser.post("/api/space/builds", entry());
    assert.equal(over.status, 400);
    assert.equal(over.body.code, "quota_exceeded");
    assert.equal(
      (await cal.browser.post("/api/space/builds", entry({ heroId: "h02" }))).status,
      200,
      "another hero has its own thirty"
    );
    assert.equal(
      (await dee.browser.post("/api/space/builds", entry())).status,
      200,
      "the limit is per account"
    );
    // the total: fill up to 300 with direct inserts, then one more is refused
    await app.store.pool.query(
      `INSERT INTO space_builds (id, user_id, hero_id, name, level, build_json, created_at, updated_at) VALUES ${Array.from(
        { length: 299 - 31 },
        () => "(UUID(), ?, 'h03', '', 15, '{}', 1, 1)"
      ).join(",")}`,
      Array.from({ length: 299 - 31 }, () => cal.user.id)
    );
    // 31 builds (30 + 1) + 268 more = 299: the 300th is accepted, the 301st is not
    assert.equal((await cal.browser.post("/api/space/builds", entry({ heroId: "" }))).status, 200);
    assert.equal((await cal.browser.post("/api/space/builds", entry({ heroId: "" }))).status, 400);
  });
});

describe("the links", { skip }, () => {
  test("a link is given once; only its hash is kept; the list never shows it", async () => {
    const eve = await app.signIn("SpaceEve");
    const given = await eve.browser.post("/api/space/links", {
      sections: ["builds", "training"],
      label: "For my coach"
    });
    assert.equal(given.status, 200, given.text);
    const { token, link } = given.body;
    assert.match(token, /^sp_[A-Za-z0-9_-]{32}$/, "192 random bits");
    assert.deepEqual(
      [link.label, link.sections, link.expiresAt, link.openedCount],
      ["For my coach", ["builds", "training"], null, 0]
    );

    const [[stored]] = await app.store.pool.query(
      "SELECT token_hash FROM space_links WHERE id = ?",
      [link.id]
    );
    assert.equal(stored.token_hash, hashToken(token));
    assert.notEqual(stored.token_hash, token);
    const listed = await eve.browser.get("/api/space");
    assert.ok(!JSON.stringify(listed.body).includes(token), "the token is not in any answer");
    assert.ok(!JSON.stringify(listed.body).includes(stored.token_hash), "nor its hash");
    assert.deepEqual(
      listed.body.links.map(item => item.id),
      [link.id]
    );

    // who may give and remove
    assert.equal(
      (await app.browser().post("/api/space/links", { sections: ["builds"] })).status,
      401
    );
    assert.equal((await eve.browser.post("/api/space/links", { sections: [] })).status, 400);
    assert.equal(
      (await eve.browser.post("/api/space/links", { sections: ["builds"], days: 3 })).status,
      400
    );
    const other = await app.signIn("SpaceFay");
    assert.equal(
      (await other.browser.delete(`/api/space/links/${link.id}`)).status,
      404,
      "not hers"
    );
    assert.equal((await open(app.browser(), token)).status, 200, "still open");
    assert.equal((await eve.browser.delete(`/api/space/links/${link.id}`)).status, 200);
    assert.equal((await eve.browser.delete(`/api/space/links/${link.id}`)).status, 404);
    assert.equal((await open(app.browser(), token)).status, 404, "a removed link opens nothing");
  });

  test("at most twenty links, and the room is per account", async () => {
    const gus = await app.signIn("SpaceGus");
    const hal = await app.signIn("SpaceHal");
    for (let index = 0; index < LINKS_MAX; index += 1) {
      assert.equal(
        (await gus.browser.post("/api/space/links", { sections: ["builds"] })).status,
        200
      );
    }
    const over = await gus.browser.post("/api/space/links", { sections: ["builds"] });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, "quota_exceeded");
    assert.equal(
      (await hal.browser.post("/api/space/links", { sections: ["builds"] })).status,
      200
    );
  });
});

describe("opening a link", { skip }, () => {
  test("anybody opens it, with no account and no cookie: only the chosen parts, read only", async () => {
    const ivy = await app.signIn("SpaceIvy");
    // a tier list that is hers, one that is shared with her, a build, a training sheet
    await ivy.browser.post("/api/tier-lists", {
      name: "My list",
      tiers: [{ id: "s", label: "S", heroes: ["h01"] }],
      unranked: []
    });
    const owner = app.browser();
    const theirs = (
      await owner.post("/api/tier-lists", { name: "Theirs", tiers: [], unranked: [] })
    ).body;
    const invite = (await owner.post(`/api/tier-lists/${theirs.id}/invites`, { role: "viewer" }))
      .body;
    assert.equal(
      (await ivy.browser.post("/api/invites/accept", { token: invite.token })).status,
      200
    );
    await ivy.browser.post("/api/space/builds", entry({ name: "Kept build" }));
    await ivy.browser.put("/api/training/focus", { heroIds: ["h02", "h01"] });
    await ivy.browser.post("/api/training/notes", {
      kind: "goal",
      title: "Wave control",
      body: "Freeze at 4:00",
      heroId: "h02"
    });
    await ivy.browser.post("/api/training/reflex/runs", {
      exercise: "reaction",
      score: 251,
      durationMs: 14_000
    });

    const all = (
      await ivy.browser.post("/api/space/links", { sections: ["tierLists", "builds", "training"] })
    ).body;
    const onlyBuilds = (await ivy.browser.post("/api/space/links", { sections: ["builds"] })).body;

    const stranger = app.browser();
    const full = await open(stranger, all.token);
    assert.equal(full.status, 200, full.text);
    assert.equal(full.headers.get("set-cookie"), null, "no cookie, no guest identity");
    assert.equal(full.body.owner.name, "SpaceIvy");
    assert.ok(!JSON.stringify(full.body).includes("@example.test"), "no e-mail address");
    assert.deepEqual(full.body.sections, ["tierLists", "builds", "training"]);
    assert.deepEqual(
      full.body.tierLists.map(list => list.name),
      ["My list"],
      "her own lists, not the ones shared with her"
    );
    assert.equal(full.body.tierLists[0].tiers[0].heroes[0], "h01");
    assert.deepEqual(
      full.body.builds.map(item => item.name),
      ["Kept build"]
    );
    assert.deepEqual(full.body.training.focus, ["h02", "h01"]);
    assert.deepEqual(
      full.body.training.notes.map(note => [note.kind, note.title, note.body]),
      [["goal", "Wave control", "Freeze at 4:00"]]
    );
    assert.deepEqual(full.body.training.reflex.best, { reaction: 251 });

    const some = (await open(stranger, onlyBuilds.token)).body;
    assert.deepEqual(some.sections, ["builds"]);
    assert.equal(some.builds.length, 1);
    assert.ok(!("tierLists" in some) && !("training" in some), "what was not chosen is not sent");

    // it is live: what changes after the link was given shows at once
    await ivy.browser.post("/api/space/builds", entry({ name: "Later build" }));
    assert.equal((await open(stranger, onlyBuilds.token)).body.builds.length, 2);

    // it counts the openings
    const links = (await ivy.browser.get("/api/space")).body.links;
    const counted = links.find(link => link.id === onlyBuilds.link.id);
    assert.equal(counted.openedCount, 2);
    assert.ok(counted.openedAt > 0);
  });

  test("the answers to the situations and the e-mail stay private whatever is shared", async () => {
    const jon = await app.signIn("SpaceJon");
    await app.store.saveTrainingAnswer?.(jon.user.id, "none", { note: "secret" }).catch(() => {});
    const { token } = (await jon.browser.post("/api/space/links", { sections: ["training"] })).body;
    const shared = (await open(app.browser(), token)).body;
    assert.deepEqual(Object.keys(shared.training).sort(), ["combos", "focus", "notes", "reflex"]);
    assert.deepEqual(Object.keys(shared.owner).sort(), ["name", "picture", "tag"]);
  });

  test("an unknown, removed, expired or malformed token opens nothing, and says the same thing", async () => {
    const kim = await app.signIn("SpaceKim");
    const given = (await kim.browser.post("/api/space/links", { sections: ["builds"], days: 7 }))
      .body;
    assert.equal((await open(app.browser(), given.token)).status, 200);
    // the week goes by
    await app.store.pool.execute("UPDATE space_links SET expires_at = ? WHERE id = ?", [
      Date.now() - 1000,
      given.link.id
    ]);
    const expired = await open(app.browser(), given.token);
    const unknown = await open(app.browser(), `sp_${"A".repeat(32)}`);
    assert.equal(expired.status, 404);
    assert.equal(unknown.status, 404);
    assert.deepEqual(
      expired.body.error ?? expired.body.message,
      unknown.body.error ?? unknown.body.message,
      "no hint of which"
    );
    for (const token of ["", "nope", "sp_x", `t_${"A".repeat(32)}`]) {
      assert.equal((await open(app.browser(), token)).status, 400, JSON.stringify(token));
    }
    assert.equal((await app.browser().post("/api/space/open", {})).status, 400);
    // a link is never looked up through an address
    assert.equal((await app.browser().get(`/api/space/open/${given.token}`)).status, 404);
  });

  test("removing the account takes the builds and the links with it", async () => {
    const lee = await app.signIn("SpaceLee");
    await lee.browser.post("/api/space/builds", entry());
    const { token } = (await lee.browser.post("/api/space/links", { sections: ["builds"] })).body;
    assert.equal((await open(app.browser(), token)).status, 200);
    await app.store.pool.execute("DELETE FROM users WHERE id = ?", [lee.user.id]);
    assert.equal((await open(app.browser(), token)).status, 404);
    const [[left]] = await app.store.pool.query(
      "SELECT (SELECT COUNT(*) FROM space_builds WHERE user_id = ?) + (SELECT COUNT(*) FROM space_links WHERE user_id = ?) AS total",
      [lee.user.id, lee.user.id]
    );
    assert.equal(Number(left.total), 0);
  });
});
