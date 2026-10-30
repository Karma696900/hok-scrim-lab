// Manual hero data: competitive imports with provenance, manual lane additions, no ranked data.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  csvToHeroRows,
  parseCsv,
  summariseCompetitive
} from "../tournaments/competitive-import.js";
import { normalizeBriefList } from "./camp-data.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const META = {
  source: "Liquipedia (HoK Global Championship)",
  sourceUrl: "https://liquipedia.net/honorofkings/Example",
  region: "Global - SEA",
  patch: "1.2.3",
  updatedAt: "2026-09-30",
  license: "CC BY-SA 3.0",
  attribution: "Data from Liquipedia, licensed CC BY-SA 3.0.",
  totalGames: 40,
  confirmGlobalOnly: true
};

describe("Camp roster adapter ignores ranked data", () => {
  const brief = (count, build) => ({
    code: 0,
    data: { heroList: Array.from({ length: count }, (_, index) => build(index)) }
  });
  const row = (index, extra = {}) => ({
    heroId: 1000 + index,
    heroName: `Hero ${index}`,
    icon: `https://camp.honorofkings.com/h${index}.png`,
    mainJobName: "Mage",
    minorJobName: "",
    recommendRoadName: ["Clash Lane", "Mid Lane", "Farm Lane", "Jungling", "Roaming"][index % 5],
    ...extra
  });

  test("ranked fields never reach the roster, whatever the response carries", () => {
    const heroes = normalizeBriefList(
      brief(90, index =>
        row(index, {
          banRate: 0.4,
          showRate: 0.5,
          winRate: 0.51,
          tRank: "T0",
          hot: "S",
          winningProbability: 0.52
        })
      )
    );
    assert.equal(heroes.length, 90);
    const serialised = JSON.stringify(heroes);
    for (const key of [
      "banRate",
      "showRate",
      "winRate",
      "tRank",
      "hot",
      "winningProbability",
      "0.51",
      "T0"
    ]) {
      assert.ok(!serialised.includes(key), key);
    }
    assert.deepEqual(Object.keys(heroes[0]).sort(), [
      "id",
      "image",
      "lanes",
      "name",
      "roles",
      "sourceIds"
    ]);
  });

  test("lanes follow Camp's road names; classes keep the secondary one", () => {
    const heroes = normalizeBriefList(
      brief(80, index => row(index, { minorJobName: index === 0 ? "Tank" : "" }))
    );
    assert.deepEqual([...new Set(heroes.flatMap(hero => hero.lanes))].sort(), [
      "Clash Lane",
      "Farm Lane",
      "Jungle",
      "Mid Lane",
      "Roamer"
    ]);
    assert.deepEqual(heroes.find(hero => hero.id === "1000").roles, ["Mage", "Tank"]);
  });

  test("two distinct Global heroes are never merged by name or neighbouring id", () => {
    const heroes = normalizeBriefList(
      brief(90, index =>
        row(
          index,
          index === 0
            ? { heroId: 123, heroName: "Lu Bu" }
            : index === 1
              ? { heroId: 128, heroName: "Fatih" }
              : {}
        )
      )
    );
    assert.deepEqual(
      heroes
        .filter(hero => ["123", "128"].includes(hero.id))
        .map(hero => hero.name)
        .sort(),
      ["Fatih", "Lu Bu"]
    );
  });

  test("a hero listed without a portrait yet (not released) is left out, the others are read", () => {
    const heroes = normalizeBriefList(
      brief(90, index =>
        row(index, index === 7 ? { icon: "" } : index === 8 ? { icon: undefined } : {})
      )
    );
    assert.equal(heroes.length, 88);
    assert.ok(!heroes.some(hero => ["1007", "1008"].includes(hero.id)));
    // what the live list of Camp did on 7 October 2026: one hero with no picture, 118 with one
    const live = normalizeBriefList(
      brief(119, index => row(index, index === 118 ? { icon: "" } : {}))
    );
    assert.equal(live.length, 118);
    // a list where the pictures are missing everywhere is not a roster: it is still refused
    assert.throws(
      () => normalizeBriefList(brief(90, index => row(index, { icon: "" }))),
      /incomplete/
    );
  });

  test("invalid lists are refused: duplicates, unknown lane, foreign portrait host, too few heroes", () => {
    assert.throws(
      () => normalizeBriefList(brief(90, index => row(index === 5 ? 4 : index))),
      /validation/
    );
    assert.throws(
      () =>
        normalizeBriefList(
          brief(90, index => row(index, index === 3 ? { recommendRoadName: "Top" } : {}))
        ),
      /validation/
    );
    assert.throws(
      () =>
        normalizeBriefList(
          brief(90, index => row(index, index === 3 ? { icon: "https://evil.example/x.png" } : {}))
        ),
      /validation/
    );
    assert.throws(() => normalizeBriefList(brief(10, row)), /incomplete/);
    assert.throws(() => normalizeBriefList({ code: 1 }), /invalid/);
  });
});

describe("CSV and rate helpers", () => {
  test("RFC 4180 parsing", () => {
    assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\r\n\n1,2'), [
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["1", "2"]
    ]);
    assert.throws(() => parseCsv('a,"unterminated'), /unterminated/);
  });
  test("heroId,picks,bans,wins header is required; extra name columns are ignored", () => {
    assert.deepEqual(csvToHeroRows("heroId,heroName,picks,bans,wins\n533,Agudo,5,2,3"), [
      { heroId: "533", heroName: "Agudo", picks: "5", bans: "2", wins: "3" }
    ]);
    assert.throws(() => csvToHeroRows("name,picks,bans,wins\nAgudo,1,1,1"), /heroId/);
  });
  test("rates come from raw counts and stay null when undefined", () => {
    assert.deepEqual(summariseCompetitive({ picks: 10, bans: 5, wins: 6 }, 40), {
      picks: 10,
      bans: 5,
      wins: 6,
      totalGames: 40,
      pickRate: 0.25,
      banRate: 0.125,
      winRate: 0.6
    });
    assert.equal(summariseCompetitive({ picks: 0, bans: 1, wins: 0 }, 40).winRate, null);
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";

describe("competitive imports (admin only)", { skip }, () => {
  const body = (
    overrides = {},
    rows = [
      { heroId: "h01", picks: 10, bans: 5, wins: 6 },
      { heroId: "h02", picks: 0, bans: 9, wins: 0 }
    ]
  ) => ({ meta: { ...META, ...overrides }, heroes: rows });

  test("only an administrator may import, list or delete", async () => {
    const user = await app.signIn("Plain");
    for (const browser of [app.browser(), user.browser]) {
      const expected = browser === user.browser ? 403 : 401;
      assert.equal((await browser.post("/api/admin/competitive-imports", body())).status, expected);
      assert.equal((await browser.get("/api/admin/competitive-imports")).status, expected);
      assert.equal(
        (await browser.post("/api/admin/heroes/h01/lanes", { lane: "Jungle" })).status,
        expected
      );
    }
  });

  test("a JSON import is stored with its provenance and surfaces on the hero sheet", async () => {
    const admin = await app.signIn("Admin", { admin: true });
    const imported = await admin.browser.post("/api/admin/competitive-imports", body());
    assert.equal(imported.status, 200, imported.text);
    assert.equal(imported.body.rows, 2);
    const sheet = (await app.browser().get("/api/heroes/h01")).body;
    assert.equal(sheet.hero.id, "h01");
    assert.equal(sheet.competitive.length, 1);
    const entry = sheet.competitive[0];
    assert.deepEqual(
      {
        source: entry.source,
        region: entry.region,
        patch: entry.patch,
        license: entry.license,
        updatedAt: entry.updatedAt
      },
      {
        source: META.source,
        region: META.region,
        patch: META.patch,
        license: META.license,
        updatedAt: META.updatedAt
      }
    );
    assert.equal(entry.sourceUrl, "https://liquipedia.net/honorofkings/Example");
    assert.match(entry.attribution, /CC BY-SA/);
    assert.deepEqual(
      [
        entry.picks,
        entry.bans,
        entry.wins,
        entry.totalGames,
        entry.pickRate,
        entry.banRate,
        entry.winRate
      ],
      [10, 5, 6, 40, 0.25, 0.125, 0.6]
    );
    assert.equal((await app.browser().get("/api/heroes/h02")).body.competitive[0].winRate, null);
    const none = (await app.browser().get("/api/heroes/h03")).body;
    assert.deepEqual(none.competitive, [], "no data = empty, the UI shows Data unavailable");
    assert.equal(none.details, null, "no sheet fetched yet = null, the UI says so");
    assert.equal(none.detailsFetchedAt, null);
    assert.equal((await app.browser().get("/api/heroes/nope")).status, 404);
  });

  test("a CSV import works and matches heroes by id only", async () => {
    const admin = await app.signIn("AdminCsv", { admin: true });
    const csv = "heroId,heroName,picks,bans,wins\nh03,anything,4,1,2\nh04,whatever,3,0,1\n";
    assert.equal(
      (await admin.browser.post("/api/admin/competitive-imports", { meta: META, csv })).status,
      200
    );
    assert.equal((await app.browser().get("/api/heroes/h03")).body.competitive[0].picks, 4);
    const byName = await admin.browser.post("/api/admin/competitive-imports", {
      meta: META,
      csv: "heroName,picks,bans,wins\nHero h05,1,1,1"
    });
    assert.equal(byName.status, 400, "names are never used to match heroes");
    const nameOnly = await admin.browser.post(
      "/api/admin/competitive-imports",
      body({}, [{ heroName: "Hero h05", picks: 1, bans: 1, wins: 1 }])
    );
    assert.equal(nameOnly.status, 400);
  });

  test("hostile or incomplete imports are refused", async () => {
    const admin = await app.signIn("AdminBad", { admin: true });
    const refused = async (payload, label) => {
      const response = await admin.browser.post("/api/admin/competitive-imports", payload);
      assert.equal(response.status, 400, `${label}: ${response.text}`);
      return response;
    };
    await refused(body({ confirmGlobalOnly: false }), "global not confirmed");
    await refused(body({ confirmGlobalOnly: undefined }), "global flag missing");
    assert.equal(
      (await refused(body({ region: "China (KPL)" }), "china")).body.code,
      "foreign_data"
    );
    await refused(body({ source: "Arena of Valor World Cup" }), "AoV source");
    await refused(body({ license: "All rights reserved" }), "licence");
    await refused(body({ license: "" }), "no licence");
    await refused(body({ attribution: "" }), "no attribution");
    await refused(body({ sourceUrl: "http://liquipedia.net/x" }), "http url");
    await refused(body({ sourceUrl: "not a url" }), "bad url");
    await refused(body({ updatedAt: "yesterday" }), "bad date");
    await refused(body({ totalGames: 0 }), "no games");
    await refused(body({}, [{ heroId: "unknown", picks: 1, bans: 0, wins: 0 }]), "unknown hero");
    await refused(body({}, [{ heroId: "h01", picks: 1, bans: 0, wins: 2 }]), "wins > picks");
    await refused(body({}, [{ heroId: "h01", picks: 99, bans: 0, wins: 0 }]), "picks > games");
    await refused(
      body({}, [
        { heroId: "h01", picks: 1, bans: 0, wins: 0 },
        { heroId: "h01", picks: 1, bans: 0, wins: 0 }
      ]),
      "duplicate hero"
    );
    await refused(body({}, []), "no rows");
    await refused(body({}, [{ heroId: "h01", picks: -1, bans: 0, wins: 0 }]), "negative");
    await refused({ heroes: [] }, "no meta");
  });

  test("imports can be listed and deleted; their stats disappear with them", async () => {
    const admin = await app.signIn("AdminList", { admin: true });
    const created = (
      await admin.browser.post(
        "/api/admin/competitive-imports",
        body({ patch: "9.9.9" }, [{ heroId: "h20", picks: 2, bans: 1, wins: 1 }])
      )
    ).body;
    assert.ok(
      (await admin.browser.get("/api/admin/competitive-imports")).body.items.some(
        item => item.id === created.id && item.patch === "9.9.9"
      )
    );
    assert.equal((await app.browser().get("/api/heroes/h20")).body.competitive.length, 1);
    assert.equal(
      (await admin.browser.delete(`/api/admin/competitive-imports/${created.id}`)).status,
      200
    );
    assert.deepEqual((await app.browser().get("/api/heroes/h20")).body.competitive, []);
    assert.equal(
      (await admin.browser.delete(`/api/admin/competitive-imports/${created.id}`)).status,
      404
    );
  });
});

describe("manual lane additions", { skip }, () => {
  test("an admin can add a lane; it is marked manual, extends the hero, and survives a roster sync", async () => {
    const admin = await app.signIn("AdminLane", { admin: true });
    const before = (await app.browser().get("/api/heroes")).body.heroes.find(
      hero => hero.id === "h06"
    );
    assert.deepEqual(before.lanes, ["Clash Lane"]);
    assert.equal(
      (
        await admin.browser.post("/api/admin/heroes/h06/lanes", {
          lane: "Mid Lane",
          note: "plays mid in pro scrims"
        })
      ).status,
      200
    );
    const after = (await app.browser().get("/api/heroes")).body.heroes.find(
      hero => hero.id === "h06"
    );
    assert.deepEqual(after.lanes, ["Clash Lane", "Mid Lane"]);
    assert.deepEqual(after.laneSources, { "Clash Lane": "camp", "Mid Lane": "manual" });

    await app.store.saveHeroes(sampleHeroes(), "20261002"); // a roster sync rewrites the Camp lane only
    const synced = (await app.browser().get("/api/heroes")).body.heroes.find(
      hero => hero.id === "h06"
    );
    assert.deepEqual(synced.lanes, ["Clash Lane", "Mid Lane"]);

    const list = await app
      .browser()
      .post("/api/tier-lists", { name: "Mid", lane: "Mid Lane", tiers: [], unranked: [] });
    assert.ok(list.body.unranked.includes("h06"), "the added lane feeds lane tier lists");

    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h06/lanes/Mid%20Lane")).status,
      200
    );
    assert.deepEqual(
      (await app.browser().get("/api/heroes")).body.heroes.find(hero => hero.id === "h06").lanes,
      ["Clash Lane"]
    );
  });

  test("a hero keeps at least one lane; duplicates and unknown lanes are refused", async () => {
    const admin = await app.signIn("AdminLane2", { admin: true });
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h07/lanes/Jungle")).status,
      400,
      "its only lane stays"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h07/lanes", { lane: "Jungle" })).status,
      400,
      "already has it"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h07/lanes", { lane: "Top" })).status,
      400
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/missing/lanes", { lane: "Jungle" })).status,
      404
    );
  });

  test("an admin can give a Flowborn form an extra lane (its Camp lane stays first), and remove it again", async () => {
    const admin = await app.signIn("AdminLane3", { admin: true });
    await app.store.saveHeroes(
      [
        ...sampleHeroes(),
        {
          id: "581",
          name: "Flowborn (Tank)",
          image: "https://camp.honorofkings.com/581.png",
          roles: ["Tank"],
          lanes: ["Clash Lane"],
          sourceIds: ["581"],
          availableGlobal: true
        }
      ],
      "20261003"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/581/lanes", { lane: "Jungle" })).status,
      200
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/581/lanes", { lane: "Jungle" })).status,
      400,
      "already has it"
    );
    const form = (await app.browser().get("/api/heroes")).body.heroes.find(
      hero => hero.id === "581"
    );
    assert.deepEqual(form.lanes, ["Clash Lane", "Jungle"]);
    assert.deepEqual(form.laneSources, { "Clash Lane": "camp", Jungle: "manual" });
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/581/lanes/Clash%20Lane")).status,
      200,
      "Camp's lane can go when another one remains"
    );
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/581/lanes/Jungle")).status,
      400,
      "but the last lane stays"
    );
    assert.equal(
      (await admin.browser.post("/api/admin/heroes/581/lanes", { lane: "Clash Lane" })).status,
      200,
      "and Camp's lane can be given back"
    );
    assert.equal((await admin.browser.delete("/api/admin/heroes/581/lanes/Jungle")).status, 200);
    const restored = (await app.browser().get("/api/heroes")).body.heroes.find(
      hero => hero.id === "581"
    );
    assert.deepEqual(
      [restored.lanes, restored.laneSources],
      [["Clash Lane"], { "Clash Lane": "camp" }]
    );
  });

  test("taking a lane away (Camp's too) or adding one reaches every lane list at once, survives a roster sync, and the last lane stays", async () => {
    const admin = await app.signIn("AdminLane4", { admin: true });
    const hero = async () =>
      (await app.browser().get("/api/heroes")).body.heroes.find(item => item.id === "h08");
    const browser = app.browser();
    const lists = {};
    for (const lane of ["Mid Lane", "Jungle"]) {
      lists[lane] = (
        await browser.post("/api/tier-lists", { name: lane, lane, tiers: [], unranked: [] })
      ).body.id;
    }
    const members = async lane => {
      const list = (await browser.get(`/api/tier-lists/${lists[lane]}`)).body;
      return [...list.unranked, ...list.tiers.flatMap(tier => tier.heroes)];
    };

    assert.deepEqual((await hero()).lanes, ["Mid Lane"]);
    assert.equal((await members("Mid Lane")).includes("h08"), true);
    assert.equal((await members("Jungle")).includes("h08"), false);

    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h08/lanes", { lane: "Jungle" })).status,
      200
    );
    assert.equal(
      (await members("Jungle")).includes("h08"),
      true,
      "added: the hero is now in the Jungle lists too"
    );
    assert.equal((await members("Mid Lane")).includes("h08"), true, "and still in the Mid ones");

    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h08/lanes/Mid%20Lane")).status,
      200,
      "Camp's lane is taken away"
    );
    const away = await hero();
    assert.deepEqual([away.lanes, away.laneSources], [["Jungle"], { Jungle: "manual" }]);
    assert.equal(
      (await members("Mid Lane")).includes("h08"),
      false,
      "removed: the hero leaves the Mid lists"
    );
    assert.equal((await members("Jungle")).includes("h08"), true);

    await app.store.saveHeroes(sampleHeroes(), "20261004"); // a roster sync lists Mid Lane again for this hero
    assert.deepEqual((await hero()).lanes, ["Jungle"], "the removal survives the sync");
    assert.equal((await members("Mid Lane")).includes("h08"), false);

    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h08/lanes/Jungle")).status,
      400,
      "the last lane stays"
    );
    assert.equal(
      (await admin.browser.delete("/api/admin/heroes/h08/lanes/Roamer")).status,
      404,
      "a lane the hero does not have"
    );
    assert.deepEqual((await hero()).lanes, ["Jungle"]);

    assert.equal(
      (await admin.browser.post("/api/admin/heroes/h08/lanes", { lane: "Mid Lane" })).status,
      200,
      "Camp's lane is given back"
    );
    const back = await hero();
    assert.deepEqual(
      [back.lanes, back.laneSources],
      [["Mid Lane", "Jungle"], { "Mid Lane": "camp", Jungle: "manual" }]
    );
    assert.equal((await members("Mid Lane")).includes("h08"), true);

    const player = await app.signIn("PlainLane");
    assert.equal((await player.browser.delete("/api/admin/heroes/h08/lanes/Jungle")).status, 403);
  });

  test("the hero API exposes no ranked field", async () => {
    const text = JSON.stringify((await app.browser().get("/api/heroes")).body);
    for (const key of ["banRate", "showRate", "winRate", "tRank", "ranked"]) {
      assert.ok(!text.includes(key), key);
    }
  });
});
