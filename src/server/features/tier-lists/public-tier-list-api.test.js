// The public tier list through the API: open to everybody, the same tier on the hero page, the
// computed tiers sent to the editors, and a new tournament series showing at once.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { addDays } from "../../../shared/period.js";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const id = number => `h${String(number).padStart(2, "0")}`;
const five = start => Array.from({ length: 5 }, (_, index) => id(start + index));
const today = new Date().toISOString().slice(0, 10);
const series = (playedOn, winner) => ({
  event: `Cup ${playedOn} ${winner}`,
  stage: "Final",
  teamA: "Alpha",
  teamB: "Beta",
  bestOf: 1,
  playedOn,
  patch: "",
  sourceUrl: "https://example.test/vod",
  note: "",
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Beta",
      winner,
      durationSeconds: 900,
      bans: { blue: [], red: [] },
      picks: { blue: five(1), red: five(11) },
      pickLanes: { blue: LANES, red: LANES }
    }
  ]
});

describe("the public tier list API", { skip }, () => {
  const tierOf = (lane, heroId) =>
    lane.tiers.find(tier => tier.heroes.some(hero => hero.heroId === heroId));

  test("tournaments first, the editors next, the same tier everywhere", async () => {
    const admin = await app.signIn("Ranker", { admin: true });
    const visitor = app.browser();
    // h01 (blue, Clash Lane) wins 7 of 10, h11 (red, Clash Lane) 3 of 10
    for (let index = 0; index < 10; index += 1) {
      const saved = await admin.browser.post(
        "/api/admin/tournaments",
        series(addDays(today, -1 - index), index < 7 ? "Alpha" : "Beta")
      );
      assert.equal(saved.status, 200, saved.text);
    }
    const rated = await admin.browser.put("/api/official-tiers/Clash%20Lane", {
      tiers: [
        { label: "A", heroes: ["h06"] },
        { label: "D", heroes: ["h01"] }
      ],
      expectedVersion: null
    });
    assert.equal(rated.status, 200, rated.text);

    const answer = await visitor.get("/api/tier-list");
    assert.equal(answer.status, 200, "no account is needed");
    assert.equal(answer.body.lanes.length, 5);
    assert.equal(answer.body.totalGames, 10);
    const clash = answer.body.lanes.find(lane => lane.lane === "Clash Lane");
    assert.equal(clash.slug, "clash");
    assert.equal(tierOf(clash, "h01").label, "SS", "the best of the lane");
    assert.equal(tierOf(clash, "h11").label, "D", "the worst of the lane");
    const editors = tierOf(clash, "h06");
    assert.equal(editors.label, "A", "never played: the editors' tier");
    assert.equal(editors.heroes.find(hero => hero.heroId === "h06").source, "editors");
    assert.deepEqual(clash.unranked, ["h16", "h21", "h26"], "neither played nor rated");

    // the hero page says the same
    const h01 = (await visitor.get("/api/heroes/h01")).body;
    assert.deepEqual(h01.ratings, { "Clash Lane": "SS" }, "the editors' D does not count");
    assert.deepEqual(h01.ratingSources, { "Clash Lane": "tournaments" });
    const h06 = (await visitor.get("/api/heroes/h06")).body;
    assert.deepEqual(
      [h06.ratings, h06.ratingSources],
      [{ "Clash Lane": "A" }, { "Clash Lane": "editors" }]
    );

    // the editors see which heroes the tournaments already rank
    const opened = (await admin.browser.get("/api/official-tiers")).body;
    const clashList = opened.lanes.find(lane => lane.lane === "Clash Lane");
    assert.deepEqual(clashList.computed, { h01: "SS", h11: "D" });

    // a new series counts at once
    const more = await admin.browser.post("/api/admin/tournaments", series(today, "Beta"));
    assert.equal(more.status, 200, more.text);
    assert.equal((await visitor.get("/api/tier-list")).body.totalGames, 11);
  });
});
