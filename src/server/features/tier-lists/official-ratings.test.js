// The official ratings: a tier list per lane (SS to D) that only the editors write and read, whose
// result is the rating shown next to each lane of a hero on its page.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { OFFICIAL_TIERS, officialList, parseOfficialInput, ratingsOf } from "./official.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const roster = sampleHeroes(20); // h01 Clash, h02 Jungle, h03 Mid, h04 Farm, h05 Roamer, h06 Clash…
const id = number => `h${String(number).padStart(2, "0")}`;

describe("an official list", () => {
  test("six tiers from SS to D, always in that order, whatever is saved", () => {
    assert.deepEqual(OFFICIAL_TIERS, ["SS", "S", "A", "B", "C", "D"]);
    const list = officialList("Clash Lane", { tiers: [{ label: "A", heroes: [id(1)] }] }, roster);
    assert.deepEqual(
      list.tiers.map(tier => tier.label),
      OFFICIAL_TIERS
    );
    assert.deepEqual(list.tiers.find(tier => tier.label === "A").heroes, [id(1)]);
  });

  test("only the heroes of the lane, each once; the others of the lane wait in Unranked", () => {
    const list = officialList(
      "Clash Lane",
      {
        tiers: [
          { label: "S", heroes: [id(1), id(2)] }, // h02 plays Jungle
          { label: "A", heroes: [id(1), id(6)] } // h01 twice
        ]
      },
      roster
    );
    assert.deepEqual(list.tiers.find(tier => tier.label === "S").heroes, [id(1)]);
    assert.deepEqual(list.tiers.find(tier => tier.label === "A").heroes, [id(6)]);
    assert.deepEqual(
      [...list.unranked].sort(),
      [id(11), id(16)],
      "the Clash Lane heroes that were not placed"
    );
  });

  test("what an editor sends is checked", () => {
    const rejects = body => assert.throws(() => parseOfficialInput(body), { code: "invalid_body" });
    rejects(null);
    rejects({ tiers: "S" });
    rejects({ tiers: [{ label: "SSS", heroes: [] }] });
    rejects({
      tiers: [
        { label: "S", heroes: [] },
        { label: "S", heroes: [] }
      ]
    });
    rejects({ tiers: [{ label: "S", heroes: ["../x"] }] });
    rejects({
      tiers: [
        { label: "S", heroes: [id(1)] },
        { label: "A", heroes: [id(1)] }
      ]
    });
    rejects({ tiers: Array.from({ length: 7 }, () => ({ label: "S", heroes: [] })) });
    assert.deepEqual(parseOfficialInput({ tiers: [{ label: "SS", heroes: [id(1)] }] }), [
      { label: "SS", heroes: [id(1)] }
    ]);
  });

  test("the rating of a hero is its tier in the list of each lane it plays and was rated in", () => {
    const documents = new Map([
      [
        "Clash Lane",
        officialList("Clash Lane", { tiers: [{ label: "A", heroes: [id(1)] }] }, roster)
      ],
      ["Jungle", { tiers: [{ label: "S", heroes: [id(1)] }] }],
      ["Mid Lane", { tiers: [{ label: "B", heroes: [id(1)] }] }]
    ]);
    assert.deepEqual(
      ratingsOf(id(1), ["Clash Lane", "Jungle"], documents),
      { "Clash Lane": "A", Jungle: "S" },
      "a hero of two lanes has one rating for each; Mid Lane is not one of its lanes"
    );
    assert.deepEqual(ratingsOf(id(1), ["Farm Lane"], documents), {}, "a lane that was not rated");
    assert.deepEqual(
      ratingsOf(id(2), ["Clash Lane"], documents),
      {},
      "a hero left in Unranked has none"
    );
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("the official ratings API", { skip }, () => {
  const tiersOf = (list, label) => list.tiers.find(tier => tier.label === label).heroes;

  test("only the editors read and write them; the tier of a hero is public on its page", async () => {
    const admin = await app.signIn("Chief", { admin: true });
    const helper = await app.signIn("Helper");
    const plain = await app.signIn("Plain");
    await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, {
      labels: ["contributor"]
    });
    const visitor = app.browser();

    assert.equal((await visitor.get("/api/official-tiers")).status, 401);
    assert.equal((await plain.browser.get("/api/official-tiers")).status, 403);
    assert.equal(
      (await plain.browser.put("/api/official-tiers/Clash%20Lane", { tiers: [] })).status,
      403
    );

    const opened = await helper.browser.get("/api/official-tiers");
    assert.equal(opened.status, 200, "a Contributor reads the lists");
    assert.deepEqual(opened.body.tiers, OFFICIAL_TIERS);
    assert.equal(opened.body.lanes.length, 5);
    const clash = opened.body.lanes.find(lane => lane.lane === "Clash Lane");
    assert.equal(clash.version, null, "never saved yet");
    assert.equal(
      clash.unranked.length,
      6,
      "every Clash Lane hero of the roster (30 heroes) waits in Unranked"
    );

    // a hero that plays two lanes: Clash and Jungle
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h01/lanes", { lane: "Jungle" })).status,
      200
    );

    const save = (lane, tiers, expectedVersion) =>
      helper.browser.put(`/api/official-tiers/${encodeURIComponent(lane)}`, {
        tiers,
        expectedVersion
      });
    const first = await save("Clash Lane", [{ label: "A", heroes: ["h01", "h06"] }], null);
    assert.equal(first.status, 200, first.text);
    assert.equal(first.body.version, 0);
    assert.deepEqual(tiersOf(first.body, "A"), ["h01", "h06"]);
    const jungle = await save("Jungle", [{ label: "S", heroes: ["h01"] }], null);
    assert.equal(jungle.status, 200, jungle.text);

    // the hero page tells its two ratings, to everybody
    const sheet = (await visitor.get("/api/heroes/h01")).body;
    assert.deepEqual(sheet.ratings, { "Clash Lane": "A", Jungle: "S" });
    assert.deepEqual((await visitor.get("/api/heroes/h06")).body.ratings, { "Clash Lane": "A" });
    assert.deepEqual(
      (await visitor.get("/api/heroes/h11")).body.ratings,
      {},
      "a hero that was not rated has no rating, nothing is guessed"
    );
    assert.equal((await visitor.get("/api/official-tiers")).status, 401, "the lists stay private");

    // two editors: the second one opened the list before the first saved
    const stale = await save("Clash Lane", [{ label: "S", heroes: ["h01"] }], null);
    assert.equal(stale.status, 409, "saved since it was opened");
    assert.equal(stale.body.code, "version_conflict");
    const next = await admin.browser.put("/api/official-tiers/Clash%20Lane", {
      tiers: [{ label: "SS", heroes: ["h01"] }],
      expectedVersion: 0
    });
    assert.equal(next.status, 200, next.text);
    assert.equal(next.body.version, 1);
    assert.deepEqual((await visitor.get("/api/heroes/h01")).body.ratings["Clash Lane"], "SS");
    assert.deepEqual(
      (await visitor.get("/api/heroes/h06")).body.ratings,
      {},
      "a hero that is no longer placed goes back to Unranked: no rating"
    );

    // what is refused
    assert.equal((await save("Top Lane", [], null)).status, 404, "not a lane");
    assert.equal((await save("Clash Lane", [{ label: "Z", heroes: [] }], 1)).status, 400);
    assert.equal(
      (await helper.browser.put("/api/official-tiers/Clash%20Lane", { expectedVersion: 1 })).status,
      400
    );

    // taking the label away closes the page at once
    await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, { labels: [] });
    assert.equal((await helper.browser.get("/api/official-tiers")).status, 403);
  });
});
