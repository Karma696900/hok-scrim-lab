// The language reaches everything the server says: the page shell, API errors, hero names and
// sheets, the PDF.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { renderExportHtml } from "../features/export/report-template.js";
import { LANGUAGES } from "../../shared/i18n.js";
import { sampleHeroes, startTestServer } from "../../testing/test-app.js";

const requested = [];
const detailsSync = {
  status: () => ({ running: false }),
  run: () => Promise.resolve(),
  requestHero: (heroId, lang) => {
    requested.push([heroId, lang]);
    return true;
  }
};
const SIZES = new Map(); // video url -> bytes, for the background list
const app = await startTestServer({
  seedHeroes: false,
  detailsSync,
  mediaProbe: async url => SIZES.get(url) ?? 0
});
if (app) {
  await app.store.saveHeroes(
    sampleHeroes(5).map((hero, index) => ({
      ...hero,
      id: String(500 + index),
      name: index === 0 ? "Flowborn (Tank)" : `Hero ${index}`,
      roles: ["Tank"]
    })),
    "20260925"
  );
  await app.store.saveHeroNames("fr", [
    { id: "501", name: "Héros Un", roles: ["Tireur d'élite"] },
    { id: "500", name: "Flowborn (Tank)", roles: ["Tank"] }
  ]);
  await app.store.saveHeroDetails("501", {
    campHeroId: "501",
    skills: [{ index: 1, name: "English skill", type: "skill", tags: [], description: [] }],
    adjustments: [],
    gallery: [],
    world: {},
    art: {}
  });
}
after(async () => {
  await app?.close();
});
const skip = app ? false : "MySQL is not reachable (docker compose up -d mysql)";
const get = (path, headers = {}) => fetch(`${app.baseUrl}${path}`, { headers });

describe("page shell language", { skip }, () => {
  test("Accept-Language picks the language, the cookie overrides it, an unknown one falls back to English", async () => {
    const html = async headers => await (await get("/", headers)).text();
    assert.match(
      await html({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.5" }),
      /<html lang="fr" dir="ltr"[^>]*>/
    );
    assert.match(await html({ "accept-language": "ar" }), /<html lang="ar" dir="rtl"[^>]*>/);
    assert.match(
      await html({ "accept-language": "fr", cookie: "hok_lang=ja" }),
      /<html lang="ja" dir="ltr"[^>]*>/
    );
    assert.match(await html({ "accept-language": "xx-YY" }), /<html lang="en" dir="ltr"[^>]*>/);
    assert.match(await html({ cookie: "hok_lang=<script>" }), /<html lang="en" dir="ltr"[^>]*>/);
  });

  test("the title, description, navigation and og:locale are in that language", async () => {
    const page = await (await get("/heroes", { "accept-language": "de" })).text();
    assert.match(page, /<title>Honor-of-Kings-Global-Helden/);
    assert.match(page, /data-view="heroes" href="\/heroes">[^]*?<span>Helden<\/span>/);
    assert.match(page, /<meta property="og:locale" content="de_DE">/);
    assert.match(page, /"\/locales\/de\.js"/);
    assert.match(
      await (await get("/heroes", { "accept-language": "en" })).text(),
      /<meta property="og:locale" content="en_US">/
    );
  });

  test("the page ships only the name of the current language on the button (the menu is built on first use: other scripts slow the first layout)", async () => {
    const page = await (await get("/", { "accept-language": "es" })).text();
    assert.match(page, /id="language-button"[^>]*>[^]*?<span>Español<\/span>/);
    for (const { name } of LANGUAGES.filter(language => language.code !== "es")) {
      assert.ok(!page.includes(`>${name}<`), `the page does not list ${name}`);
    }
  });

  test("the response varies on the language so shared caches keep them apart", async () => {
    const response = await get("/", { "accept-language": "fr" });
    assert.match(response.headers.get("vary") ?? "", /Accept-Language/i);
    assert.match(response.headers.get("vary") ?? "", /Cookie/i);
  });

  test("the catalogs are served as modules (and are public files)", async () => {
    const response = await get("/locales/fr.js");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.match(await response.text(), /"Sign in": "Se connecter"/);
  });
});

describe("API messages", { skip }, () => {
  test("errors are translated, their code is not", async () => {
    const english = await (await get("/api/heroes/999999")).json();
    assert.equal(english.error, "Hero not found.");
    const french = await (await get("/api/heroes/999999", { "accept-language": "fr" })).json();
    assert.equal(french.error, "Héros introuvable.");
    assert.equal(french.code, english.code);
    const russian = await (await get("/api/heroes/999999", { cookie: "hok_lang=ru" })).json();
    assert.equal(russian.error, "Герой не найден.");
  });

  test("messages with values keep them", async () => {
    const response = await get("/api/series?pageSize=500", { "accept-language": "de" });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /pageSize muss zwischen 1 und \d+ liegen\./);
  });

  test("validation of a body is translated too", async () => {
    const response = await fetch(`${app.baseUrl}/api/series`, {
      method: "POST",
      headers: { "content-type": "application/json", "accept-language": "es" },
      body: JSON.stringify({ teamA: 5 })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /debe ser una cadena de texto/);
  });
});

describe("hero data in the visitor's language", { skip }, () => {
  test("names and classes come from Camp's own localized list; ids and lanes never change", async () => {
    const french = await (await get("/api/heroes", { "accept-language": "fr" })).json();
    const hero = french.heroes.find(item => item.id === "501");
    assert.equal(hero.name, "Héros Un");
    assert.deepEqual(hero.roles, ["Tireur d'élite"]);
    assert.equal(hero.englishName, "Hero 1");
    assert.deepEqual(hero.lanes, sampleHeroes(5)[1].lanes);
    assert.equal(french.namesLanguage, "fr");
    const english = await (await get("/api/heroes")).json();
    assert.equal(english.heroes.find(item => item.id === "501").name, "Hero 1");
  });

  test("a language Camp has not been asked yet shows English names, nothing invented", async () => {
    const korean = await (await get("/api/heroes", { "accept-language": "ko" })).json();
    assert.equal(korean.namesLanguage, "en");
    assert.equal(korean.heroes.find(item => item.id === "501").name, "Hero 1");
  });

  test("every Flowborn form reads Flowborn, localized or not", async () => {
    const hero = (await (await get("/api/heroes", { "accept-language": "fr" })).json()).heroes.find(
      item => item.id === "500"
    );
    assert.equal(hero.displayName, "Flowborn");
  });

  test("the sheet falls back to English while the translated one is queued once", async () => {
    requested.length = 0;
    const sheet = await (await get("/api/heroes/501", { "accept-language": "fr" })).json();
    assert.equal(sheet.language, "fr");
    assert.equal(sheet.detailsLanguage, "en");
    assert.equal(sheet.details.skills[0].name, "English skill");
    assert.deepEqual(requested, [["501", "fr"]]);
    assert.equal(sheet.hero.name, "Héros Un");
  });

  test("a stored translated sheet is served, and nothing is queued", async () => {
    await app.store.saveHeroDetails(
      "501",
      {
        campHeroId: "501",
        skills: [{ index: 1, name: "Compétence", type: "skill", tags: [], description: [] }],
        adjustments: [],
        gallery: [],
        world: {},
        art: {}
      },
      "fr"
    );
    requested.length = 0;
    const sheet = await (await get("/api/heroes/501", { "accept-language": "fr" })).json();
    assert.equal(sheet.detailsLanguage, "fr");
    assert.equal(sheet.details.skills[0].name, "Compétence");
    assert.deepEqual(requested, []);
    assert.equal(
      (await (await get("/api/heroes/501")).json()).details.skills[0].name,
      "English skill",
      "English visitors keep the English sheet"
    );
  });

  test("English never queues anything", async () => {
    requested.length = 0;
    await get("/api/heroes/501");
    assert.deepEqual(requested, []);
  });
});

describe("page background video", { skip }, () => {
  test("only heroes with a Camp video are offered, in the visitor's language when Camp's localized cut is stored", async () => {
    await app.store.saveHeroDetails("502", {
      campHeroId: "502",
      skills: [],
      adjustments: [],
      gallery: [],
      world: { video: "https://camp.honorofkings.com/camp/admin/wiki/hero/video/EN502.mp4" },
      art: {}
    });
    await app.store.saveHeroDetails(
      "502",
      {
        campHeroId: "502",
        skills: [],
        adjustments: [],
        gallery: [],
        world: { video: "https://camp.honorofkings.com/camp/admin/wiki/hero/video/FR502.mp4" }
      },
      "fr"
    );
    SIZES.set("https://camp.honorofkings.com/camp/admin/wiki/hero/video/EN502.mp4", 5_000_000).set(
      "https://camp.honorofkings.com/camp/admin/wiki/hero/video/FR502.mp4",
      6_000_000
    );
    await get("/api/backgrounds"); // the first call starts measuring in the background
    await new Promise(resolve => setTimeout(resolve, 150));
    const english = (await (await get("/api/backgrounds")).json()).items;
    assert.deepEqual(
      english.map(item => item.heroId),
      ["502"],
      "501 has no video"
    );
    assert.match(english[0].video, /EN502/);
    await get("/api/backgrounds", { "accept-language": "fr" });
    await new Promise(resolve => setTimeout(resolve, 150));
    const french = (await (await get("/api/backgrounds", { "accept-language": "fr" })).json())
      .items;
    assert.ok(french.length === 1);
    assert.match(french[0].video, /FR502/);
    assert.ok(english.every(item => item.video.startsWith("https://")));
    SIZES.set("https://camp.honorofkings.com/camp/admin/wiki/hero/video/HEAVY.mp4", 60_000_000);
  });
});

describe("PDF in the owner's language", () => {
  const heroById = new Map();
  const series = {
    teamA: { name: "A" },
    teamB: { name: "B" },
    bestOf: 3,
    gameMode: "global-ban-pick",
    status: "complete",
    updatedAt: "2026-09-30T00:00:00Z",
    games: [
      {
        gameNumber: 1,
        blueTeam: "A",
        redTeam: "B",
        winner: "A",
        durationSeconds: 600,
        draft: { bans: { blue: [], red: [] }, picks: { blue: [], red: [] }, actions: [] }
      }
    ],
    currentGame: null
  };
  const render = language =>
    renderExportHtml({
      generatedAt: "x",
      ownerName: "Coach",
      filters: { status: "complete" },
      series: [series],
      heroById,
      portraitPath: () => null,
      language
    });

  test("French and Japanese reports are in their language, Arabic is right-to-left", () => {
    assert.match(render("fr"), /<html lang="fr" dir="ltr">/);
    assert.match(render("fr"), /Export de séries/);
    assert.match(render("ja"), /シリーズのエクスポート/);
    assert.match(render("ar"), /<html lang="ar" dir="rtl">/);
    assert.match(render("en"), /Series export/);
  });

  test("an unknown language is English and no placeholder is left behind", () => {
    for (const language of ["en", "fr", "ru", "zh", "ar"]) {
      assert.doesNotMatch(render(language), /\{\w+\}/, language);
    }
  });
});
