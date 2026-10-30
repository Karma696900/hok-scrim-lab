// Camp hero sheets: pure normalisers, storage, API, admin sync (with a fake Camp), and the hero
// sheet in a browser-free check.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import {
  normalizeAdjustments,
  normalizeHeroDetails,
  parseColorText,
  safeMediaUrl
} from "./camp-data.js";
import { createDetailsSync } from "./sync/details-sync.js";
import { sampleHeroes, startTestServer } from "../../../testing/test-app.js";

const skill = (index, extra = {}) => ({
  skillId: 53300 + index * 10,
  skillName: `Skill ${index}`,
  skillIcon: "https://camp.honorofkings.com/Global/Common/UGUI/SystemRes/902_HeroSkillIcon/1.png",
  skillDesc: "Deals <color=#ff6600>damage</color> and <color=#6bc872>heals</color>.<br>Second line",
  skillCostList: { skillCostType: 0, skillCost: index ? 50 : 0 },
  skillTag: [{ name: "Damage", backgroundColor: "#ff6600", textColor: "#ff6600" }],
  skillCd: index ? 15000 : 1000,
  skillVideo: "https://res.sgameglobal.com/Global/EN/Video/HeroSkill/533/1.mp4",
  skillIndex: index,
  isUlt: index === 3,
  isPassive: index === 0,
  ...extra
});
const detailPayload = (extra = {}) => ({
  code: 0,
  data: {
    baseInfo: {
      heroInfo: {
        heroId: 533,
        heroName: "Agudo",
        mainJobName: "Marksman",
        minorJobName: "",
        recommendRoadName: "Jungling",
        firstTimeUpgradeSkill: 2
      },
      displayData: { heroCover: "https://camp.honorofkings.com/c.jpg", heroCoverColor: "#185A47" },
      cg: null
    },
    heroData: {
      baseData: { hot: "C", winRate: "53.48%", matchRate: "0.52%", banRate: "0.05%" },
      heroListingTime: "2023-09-21T03:00:00Z",
      adjustData: [
        {
          seasonId: "15",
          seasonName: "S15",
          versionName: "2026/08/27",
          versionPublishTime: "2026-08-27T01:00:00Z",
          adjustContent: {
            shortDesc: "Adjusted",
            contentTag: { text: "Stat Changes", fontColorH5: "#0DAFEB" }
          }
        }
      ]
    },
    strategyData: {
      skill: [{ skillList: [skill(2), skill(0), skill(1), skill(3)] }],
      combination: [{ heroCombination: [], combinationData: [{ dataValue: "8.53%" }] }]
    },
    worldData: {
      world: {
        height: "145 cm",
        region: "Yi",
        identity: "Forest Child",
        energy: "Martial Arts",
        video: { videoUrl: "https://camp.honorofkings.com/v.mp4" }
      },
      libraryList: [
        {
          image: {
            id: 1,
            title1: "Agudo",
            oriPicUrl: "https://camp.honorofkings.com/a.png",
            oriPicWidth: 500,
            oriPicHeight: 500
          }
        },
        { image: { id: 2, title1: "Fan art", oriPicUrl: "https://ugc.example.com/b.png" } }
      ]
    },
    ugcData: { commentList: [{ text: "ranked chatter" }] },
    ...extra
  }
});

describe("Camp text and URL safety", () => {
  test("colour tags become plain segments, other markup is stripped", () => {
    assert.deepEqual(parseColorText("a <color=#FF6600>b</color><br>c <b>d</b><script>x</script>"), [
      { t: "a ", c: null },
      { t: "b", c: "#ff6600" },
      { t: "\nc dx", c: null }
    ]);
    assert.ok(
      parseColorText("<color=red>x</color>").every(segment => segment.c === null),
      "an invalid colour is dropped, never passed on"
    );
    assert.equal(
      parseColorText("x".repeat(10_000))
        .map(segment => segment.t)
        .join("").length <= 1500,
      true
    );
  });
  test("media URLs: the exact hosts of the hero data, never a suffix of a cloud provider's domain", () => {
    // anybody can open a bucket under a provider's domain: the image proxy would fetch and keep what is put there
    for (const bad of [
      "https://attacker.cos.ap-singapore.myqcloud.com/a.png",
      "https://9999999999.vod2.myqcloud.com/a.jpg",
      "https://myqcloud.com/a.png",
      "https://1500020538.vod2.myqcloud.com.evil.example/a.jpg",
      "https://evil.example/1500020538.vod2.myqcloud.com/a.jpg",
      "https://evil.example@camp.honorofkings.com.evil.example/a.png",
      "https://camp.honorofkings.com@evil.example/a.png"
    ]) {
      assert.equal(safeMediaUrl(bad), null, bad);
    }
  });
  test("media URLs: https on Camp hosts only", () => {
    assert.ok(safeMediaUrl("https://camp.honorofkings.com/a.png"));
    assert.ok(safeMediaUrl("https://res.sgameglobal.com/x.mp4"));
    assert.ok(safeMediaUrl("https://1500020538.vod2.myqcloud.com/a.jpg"));
    for (const bad of [
      "http://camp.honorofkings.com/a.png",
      "https://evil.example/a.png",
      "https://camp.honorofkings.com.evil.example/a.png",
      "javascript:alert(1)",
      "//camp.honorofkings.com/a",
      "",
      null,
      5,
      `https://camp.honorofkings.com/${"a".repeat(700)}`
    ]) {
      assert.equal(safeMediaUrl(bad), null, String(bad).slice(0, 40));
    }
  });
});

describe("hero sheet normalisation", () => {
  const details = normalizeHeroDetails(detailPayload());
  test("identity, lane, classes and release date come from Camp", () => {
    assert.deepEqual(
      [
        details.campHeroId,
        details.name,
        details.mainClass,
        details.minorClass,
        details.lane,
        details.listedAt
      ],
      ["533", "Agudo", "Marksman", null, "Jungle", "2023-09-21T03:00:00Z"]
    );
    assert.deepEqual(details.world, {
      height: "145 cm",
      region: "Yi",
      identity: "Forest Child",
      energy: "Martial Arts",
      video: "https://camp.honorofkings.com/v.mp4"
    });
  });
  test("skills are ordered, typed and carry cost, cooldown, tags, video and coloured text", () => {
    assert.deepEqual(
      details.skills.map(item => [item.index, item.type, item.label]),
      [
        [0, "passive", "Passive"],
        [1, "skill", "Skill 1"],
        [2, "skill", "Skill 2"],
        [3, "ultimate", "Ultimate"]
      ]
    );
    const first = details.skills[1];
    assert.deepEqual(
      [first.cost, first.cooldownSeconds, first.tags, first.video],
      [
        50,
        15,
        [{ name: "Damage", color: "#ff6600" }],
        "https://res.sgameglobal.com/Global/EN/Video/HeroSkill/533/1.mp4"
      ]
    );
    assert.equal(
      first.description.some(segment => segment.c === "#6bc872" && segment.t === "heals"),
      true
    );
    assert.equal(details.skills[0].cost, null);
    assert.equal(details.firstSkillToLevel, 2);
  });
  test("RANKED DATA IS NEVER KEPT: no popularity, rates, tier, pairing percentages or community content", () => {
    const text = JSON.stringify(details);
    for (const forbidden of [
      "53.48",
      "0.52%",
      "0.05%",
      "winRate",
      "matchRate",
      "banRate",
      '"hot"',
      "8.53%",
      "combination",
      "ranked chatter",
      "ugcData"
    ]) {
      assert.ok(!text.includes(forbidden), forbidden);
    }
  });
  test("artwork keeps official Camp-hosted images only (no community uploads)", () => {
    assert.deepEqual(
      details.gallery.map(item => item.title),
      ["Agudo"]
    );
  });
  test("a response for another shape is refused", () => {
    assert.throws(() => normalizeHeroDetails({ code: 1 }), /invalid/);
    assert.throws(
      () => normalizeHeroDetails({ code: 0, data: { baseInfo: { heroInfo: { heroId: "x" } } } }),
      /invalid/
    );
  });
  test("detailed patch history replaces the summary and keeps before/after text", () => {
    const adjust = {
      code: 0,
      data: {
        adjustInfo: [
          {
            seasonId: "16",
            seasonName: "S16",
            versionName: "2026/09/23",
            versionPublishTime: "2026-09-23T01:00:00Z",
            isCurrent: true,
            adjustContent: {
              shortDesc: "Stats Adjusted",
              contentTag: { text: "Stat Changes", fontColorH5: "#0DAFEB26" },
              attribute: [
                {
                  title: "Triple Threat",
                  attributeDesc: "Base Damage:\r\nBefore: 130\r\nNow: 120",
                  heroSkillInfo: {
                    skillName: "Triple Threat",
                    skillIndexDesc: "Skill 2",
                    skillIcon: "https://camp.honorofkings.com/i.png"
                  }
                },
                { title: "", attributeDesc: "Crit: 200% → 185%<br>", heroSkillInfo: null },
                { title: "empty", attributeDesc: "" }
              ]
            }
          }
        ]
      }
    };
    const detailed = normalizeHeroDetails(detailPayload(), adjust);
    assert.equal(detailed.adjustmentsDetailed, true);
    assert.equal(detailed.adjustments.length, 1);
    const [entry] = detailed.adjustments;
    assert.deepEqual([entry.seasonName, entry.current, entry.tag.color], ["S16", true, "#0dafeb"]);
    assert.equal(entry.changes.length, 2, "empty changes are dropped");
    assert.equal(entry.changes[0].text, "Base Damage:\nBefore: 130\nNow: 120");
    assert.equal(entry.changes[0].skill.label, "Skill 2");
    assert.equal(entry.changes[1].text, "Crit: 200% → 185%");
    assert.equal(normalizeAdjustments("nope").length, 0);
  });
  test("a cinematic keeps unsigned sources sorted by height and a Camp cover", () => {
    const cg = {
      videoCover: "https://camp.honorofkings.com/cover.jpg",
      video: {
        title1: "Fatih",
        videoInfo: {
          duration: 60,
          coverURL: "https://1500020538.vod2.myqcloud.com/c.jpg",
          transcodeInfo: [
            { mediaURL: "https://1500020538.vod2.myqcloud.com/b.mp4", height: 1080, width: 1920 },
            { mediaURL: "https://1500020538.vod2.myqcloud.com/a.mp4", height: 540, width: 960 },
            { mediaURL: "https://evil.example/c.mp4", height: 720 }
          ]
        }
      }
    };
    const result = normalizeHeroDetails(
      detailPayload({ baseInfo: { ...detailPayload().data.baseInfo, cg } })
    ).cinematic;
    assert.deepEqual(
      result.sources.map(source => source.height),
      [540, 1080]
    );
    assert.equal(result.durationSeconds, 60);
    assert.equal(result.cover, "https://camp.honorofkings.com/cover.jpg");
  });
});

describe("details sync service", () => {
  const roster = ["a", "b", "c"].map(id => ({ id, availableGlobal: true }));
  const makeStore = (known = new Map()) => {
    const saved = [];
    return {
      saved,
      store: {
        readHeroes: async () => roster,
        heroDetailsStatus: async () => known,
        saveHeroDetails: async (id, details) => {
          saved.push([id, details]);
        }
      }
    };
  };

  test("only heroes without a sheet (or an old one) are fetched; each is saved as soon as it arrives", async () => {
    const { saved, store } = makeStore(
      new Map([
        ["a", new Date().toISOString()],
        ["b", "2020-01-01T00:00:00.000Z"]
      ])
    );
    const requested = [];
    const sync = createDetailsSync({
      store,
      cooldownMs: 0,
      fetchDetails: async (ids, { onHero }) => {
        requested.push(ids);
        for (const id of ids) {
          await onHero(id, { campHeroId: id }, null);
        }
      }
    });
    const status = await sync.run();
    assert.deepEqual(requested, [["b", "c"]]);
    assert.deepEqual(
      saved.map(([id]) => id),
      ["b", "c"]
    );
    assert.deepEqual([status.total, status.done, status.failed, status.running], [2, 2, 0, false]);
  });

  test("a failed hero keeps its previous sheet and the run continues; force refetches everything", async () => {
    const { saved, store } = makeStore(new Map([["a", new Date().toISOString()]]));
    const sync = createDetailsSync({
      store,
      cooldownMs: 0,
      fetchDetails: async (ids, { onHero }) => {
        for (const id of ids) {
          await onHero(
            id,
            id === "a" ? null : { campHeroId: id },
            id === "a" ? new Error("boom") : null
          );
        }
      }
    });
    const forced = await sync.run({ force: true });
    assert.deepEqual(
      [forced.total, forced.done, forced.failed, forced.lastError],
      [3, 2, 1, "boom"]
    );
    assert.deepEqual(
      saved.map(([id]) => id),
      ["b", "c"],
      "nothing was written for the failed hero"
    );
  });

  test("one run at a time, a cooldown for manual runs, and a crash is contained", async () => {
    const { store } = makeStore();
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    let calls = 0;
    const sync = createDetailsSync({
      store,
      cooldownMs: 60_000,
      fetchDetails: async () => {
        calls += 1;
        await gate;
      }
    });
    const first = sync.run({ manual: true });
    const second = sync.run({ manual: true });
    assert.equal(first, second);
    release();
    await first;
    assert.equal(calls, 1);
    assert.throws(
      () => sync.run({ manual: true }),
      error => error.status === 429
    );
    const crashing = createDetailsSync({
      store,
      cooldownMs: 0,
      fetchDetails: async () => {
        throw new Error("chromium missing");
      }
    });
    const status = await crashing.run();
    assert.equal(status.lastError, "chromium missing");
    assert.equal(status.running, false);
  });
});

const fake = { calls: [] };
const detailsSync = {
  status: () => ({ running: false, total: 3, done: 3, failed: 0 }),
  run: (options = {}) => {
    fake.calls.push(options);
    return Promise.resolve();
  }
};
const app = await startTestServer({ seedHeroes: false });
if (app) {
  await app.store.saveHeroes(sampleHeroes(30), "20260925");
}
after(async () => {
  await app?.close();
});

describe(
  "hero sheet API",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("a stored sheet is served with the hero; heroes without one say null", async () => {
      const sheet = normalizeHeroDetails(detailPayload());
      await app.store.saveHeroDetails("h01", sheet);
      const found = (await app.browser().get("/api/heroes/h01")).body;
      assert.equal(found.details.skills.length, 4);
      assert.equal(found.details.world.region, "Yi");
      assert.ok(found.detailsFetchedAt);
      assert.equal((await app.browser().get("/api/heroes/h02")).body.details, null);
      const text = JSON.stringify({ ...found, tournament: undefined }); // the tournament block is our own data, with its own rates
      for (const forbidden of ["winRate", "matchRate", "banRate", "8.53%"]) {
        assert.ok(
          !text.includes(forbidden) || (forbidden === "winRate" && !found.details),
          forbidden
        );
      }
    });

    test("a failed re-fetch cannot erase a stored sheet, a new one replaces it whole", async () => {
      await app.store.saveHeroDetails("h03", { schema: 1, skills: [{ name: "old" }] });
      await app.store.saveHeroDetails("h03", {
        schema: 1,
        skills: [{ name: "new" }, { name: "newer" }]
      });
      assert.deepEqual(
        (await app.store.getHeroDetails("h03")).details.skills.map(item => item.name),
        ["new", "newer"]
      );
      assert.equal((await app.store.heroDetailsStatus()).has("h03"), true);
    });

    test("deleting a hero removes its sheet (foreign key)", async () => {
      await app.store.saveHeroDetails("h04", { schema: 1 });
      await app.store.pool.query("DELETE FROM heroes WHERE id = 'h04'");
      assert.equal(await app.store.getHeroDetails("h04"), null);
    });

    test("the admin sync endpoints need an administrator", async () => {
      assert.equal((await app.browser().get("/api/admin/hero-details")).status, 401);
      assert.equal((await app.browser().post("/api/admin/hero-details/sync", {})).status, 401);
      const user = await app.signIn("Plain");
      assert.equal((await user.browser.post("/api/admin/hero-details/sync", {})).status, 403);
      const admin = await app.signIn("Admin", { admin: true });
      const status = (await admin.browser.get("/api/admin/hero-details")).body;
      assert.equal(status.available, false, "this test server has no details sync wired");
      assert.ok(status.stored >= 1);
      assert.equal((await admin.browser.post("/api/admin/hero-details/sync", {})).status, 400);
    });

    test("with a sync service wired, an admin starts a run in the background", async () => {
      const wired = await startTestServer({ seedHeroes: false, detailsSync });
      try {
        const admin = await wired.signIn("Admin2", { admin: true });
        const started = await admin.browser.post("/api/admin/hero-details/sync", { force: true });
        assert.equal(started.status, 200, started.text);
        assert.equal(started.body.started, true);
        assert.deepEqual(fake.calls.at(-1), { manual: true, force: true, lang: "en" });
        assert.equal((await admin.browser.get("/api/admin/hero-details")).body.available, true);
      } finally {
        await wired.close();
      }
    });

    test("the CSP lets the sheet play Camp videos and nothing else", async () => {
      const csp = (await fetch(`${app.baseUrl}/`)).headers.get("content-security-policy");
      assert.match(
        csp,
        /media-src 'self' https:\/\/res\.sgameglobal\.com https:\/\/camp\.honorofkings\.com/
      );
      assert.doesNotMatch(csp, /media-src[^;]*\*/);
    });
  }
);
