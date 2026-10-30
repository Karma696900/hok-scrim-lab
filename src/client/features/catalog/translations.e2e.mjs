// Browser check of the automatic translation of what the staff writes. A scripted translator (never a
// real service) answers for the stats, tags, items, passives and builds an administrator wrote; a visitor
// reads them in French or Arabic (the typed text in English, and as typed while a text has no
// translation yet); the Translations tab of the Catalog shows how far it is, filters, corrects a
// translation by hand, goes back to the automatic one, keeps a text as typed, and tries a failed
// translation again. Without a translation service the tab says so and still lets the staff translate
// by hand. Phone width has no horizontal scroll.
import { chromium } from "playwright";
import { textOf } from "../../../testing/text.js";
import { startTestServer } from "../../../testing/test-app.js";
import { openHeroTab } from "../../../testing/nav.js";

// what the scripted translator answers (every other text comes back as "<text> (<language>)")
const KNOWN = {
  fr: {
    "Attack range": "Portée d'attaque",
    Melee: "Mêlée",
    Ranged: "À distance",
    "Max HP": "PV max",
    "Range bonus": "Bonus de portée",
    Marksman: "Tireur",
    "Shoots from far away": "Tire de loin",
    "Bow of dusk": "Arc du crépuscule",
    "A bow for the long evenings": "Un arc pour les longues soirées",
    "after the active": "après l'actif",
    Pierce: "Perforation",
    "Melee heroes: 5%.": "Héros de mêlée : 5 %.",
    "Ranged heroes: 3%.": "Héros à distance : 3 %.",
    Dusk: "Crépuscule",
    "Safe against assassins": "Sûr contre les assassins"
  },
  ar: {
    "Attack range": "مدى الهجوم",
    Ranged: "عن بعد",
    Melee: "قتال قريب",
    "Max HP": "أقصى صحة"
  }
};
const BROKEN_TEXT = "Ranged heroes: 3%.";

function scriptedTranslator() {
  const calls = [];
  const behaviour = { changeANumber: false };
  return {
    calls,
    behaviour,
    name: "scripted",
    label: "Scripted service",
    limits: { maxItems: 50, maxChars: 20_000 },
    // what the account of a real service would say about its quota
    usage: async () => ({ used: 12_345, limit: 500_000, unlimited: false, resetsAt: null }),
    async translate({ items, languages }) {
      calls.push({ texts: items.map(item => item.text), languages: [...languages] });
      const answers = new Map();
      for (const item of items) {
        const texts = {};
        for (const language of languages) {
          texts[language] = KNOWN[language]?.[item.text] ?? `${item.text} (${language})`;
        }
        if (behaviour.changeANumber && item.text === BROKEN_TEXT) {
          // a translation that changed a number is refused by the server
          texts.fr = "Héros à distance : 4 %.";
        }
        answers.set(item.hash, { source: "en", texts, failed: {} });
      }
      return answers;
    }
  };
}

const provider = scriptedTranslator();
const app = await startTestServer({
  translationProvider: provider,
  translationConfig: { dailyChars: 1_000_000 }
});
const admin = await app.signIn("Chief", { admin: true });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, { width = 1440, language = "" } = {}, server = app) => {
  const context = await browser.newContext({ viewport: { width, height: 1300 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: server.baseUrl }
    ]);
  }
  if (language) {
    await context.addCookies([{ name: "hok_lang", value: language, url: server.baseUrl }]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};
const text = textOf;
/** True when the page does not scroll sideways; when it does, says which elements stick out. */
async function noSideScroll(page) {
  const wide = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
      ? []
      : [...document.querySelectorAll("body *")]
          .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 8)
          .map(element => `${element.localName}.${String(element.className).slice(0, 50)}`)
  );
  if (wide.length) {
    console.log("     sticking out:", wide.join(" | "));
  }
  return wide.length === 0;
}
const dictionary = async language =>
  (await app.browser().get(`/api/content-translations?lang=${language}`)).body.texts;
/** The texts written in the boxes of the list (innerText does not hold what is typed in a box). */
const written = page =>
  page.locator("#tr-list textarea").evaluateAll(areas => areas.map(area => area.value));
/** Waits until the server answers what is wanted (asked again from here: waitForFunction does not poll an async function). */
async function until(page, what, ask) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await ask()) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`never happened: ${what}`);
}
/** A visitor reading in a language asks for it, without anything waiting for it: wait for that to be written. */
const askedFor = (page, code) =>
  until(page, `${code} is asked for`, async () =>
    (await app.translations.status()).wanted.includes(code)
  );
const toastSays = (page, pattern) =>
  page.waitForFunction(
    source => new RegExp(source).test(document.querySelector("#toasts")?.innerText ?? ""),
    pattern.source
  );

// ---- what the staff wrote ------------------------------------------------------------------------------------
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const range = await post("/api/admin/catalog/stats", {
  name: "Attack range",
  unit: "choice",
  options: [{ name: "Melee" }, { name: "Ranged" }]
});
const hp = await post("/api/admin/catalog/stats", { name: "Max HP", unit: "whole" });
const bonus = await post("/api/admin/catalog/stats", { name: "Range bonus" });
const marksman = await post("/api/admin/catalog/tags", {
  name: "Marksman",
  description: "Shoots from far away"
});
const melee = { match: "all", of: [{ kind: "stat", statId: range, options: [1] }] };
const ranged = { match: "all", of: [{ kind: "stat", statId: range, options: [2] }] };
const bow = await post("/api/admin/catalog/items", {
  name: "Bow of dusk",
  category: "regular",
  description: "A bow for the long evenings",
  stats: [
    { statId: hp, value: 300 },
    { statId: hp, value: 100, when: melee },
    {
      statId: bonus,
      value: 1.5,
      temporary: true,
      durationSeconds: 3,
      note: "after the active",
      when: ranged
    }
  ],
  effects: [
    { kind: "passive", name: "Pierce", text: "Melee heroes: 5%.", when: melee },
    { kind: "passive", name: "Pierce", text: BROKEN_TEXT, when: ranged }
  ]
});
const charm = await post("/api/admin/catalog/items", {
  name: "Charm",
  category: "regular",
  stats: [{ statId: hp, value: 50 }]
});
await admin.browser.put("/api/admin/heroes/h02/profile", {
  baseStats: [
    { statId: range, option: 2 },
    { statId: hp, value: 2500, growth: 90 }
  ],
  tags: [marksman],
  skills: []
});
await admin.browser.put("/api/builds/h02/1", {
  name: "Dusk",
  note: "Safe against assassins",
  build: { items: [bow, charm], utility: [], late: [], core: [bow, charm], arcana: {} }
});

const lab = async (page, hero = "h02") => {
  await page.goto(`${app.baseUrl}/build-lab?i=${bow}.${charm}&h=${hero}&lv=10`);
  await page.waitForSelector(".stats-table");
  await page.click(`.build-slot[data-piece="item:${bow}"]`);
  await page.waitForSelector(".piece-stat");
};
const rowOf = async (page, name) =>
  (await page.locator(`.stats-table tbody tr:has(th:text-is("${name}")) td`).allInnerTexts()).map(
    cell => cell.replace(/\s+/g, " ").trim()
  );

// ---- nothing is translated yet: everything reads as it was typed ------------------------------------------
const french = await open(null, { language: "fr" });
await lab(french);
check(
  "before any translation, a visitor in French reads the texts as they were typed",
  (await rowOf(french, "Max HP")).length > 0 &&
    /Attack range/.test(await text(french, ".stats-table")) &&
    /A bow for the long evenings/.test(await text(french, ".piece-details"))
);
check(
  "the dictionary of a language with no translation is empty, not an error",
  Object.keys(await dictionary("fr")).length === 0
);

// ---- a round of the translator -----------------------------------------------------------------------------------------
await askedFor(french, "fr");
check(
  "the first reader in French asked for French, and for no other language",
  (await app.translations.status()).wanted.join() === "fr"
);
provider.behaviour.changeANumber = true;
await app.translations.sweep();
const asked = provider.calls.flatMap(call => call.texts);
const status = await app.translations.status();
check(
  "each text of the staff was asked once, whatever the number of languages",
  asked.length === status.texts && new Set(asked).size === asked.length
);
check(
  "a translation that changed a number is not used: one failed, the others are done",
  status.total.failed === 1 && status.total.pending === 0
);

// ---- a visitor in French ----------------------------------------------------------------------------------------------------
await lab(french);
check(
  "a visitor in French reads the names of the stats and of the options translated",
  (await rowOf(french, "Portée d'attaque")).join("|").includes("À distance") &&
    (await rowOf(french, "PV max")).length > 0
);
const slot = await text(french, `.build-slot[data-piece="item:${bow}"]`);
const details = await text(french, ".piece-details");
check(
  "the name of the item, its description, its passives and the note of a bonus are translated",
  /Arc du crépuscule/.test(slot + details) &&
    /Un arc pour les longues soirées/.test(details) &&
    /Perforation/.test(details) &&
    /Héros de mêlée : 5 %\./.test(details) &&
    /après l'actif/.test(details)
);
check(
  "the conditions of the lines name the stat and the option in French",
  /Portée d'attaque/.test(details) && /À distance/.test(details)
);
check(
  "the text whose translation was refused is shown as it was typed",
  new RegExp(BROKEN_TEXT.replace(/[.%]/g, "\\$&")).test(details)
);

await french.goto(`${app.baseUrl}/heroes`);
await french.click('.hcard[data-hero-id="h02"]');
await openHeroTab(french, "builds");
await french.waitForSelector(".build-card");
// the build is on its tab, the tags of the hero on the overview: the text of the whole sheet is read
const sheet = await french.locator("main").textContent();
check(
  "the sheet of a hero shows its recommended build and its tags in French",
  /Crépuscule/.test(sheet) && /Sûr contre les assassins/.test(sheet) && /Tireur/.test(sheet)
);

// ---- English, and Arabic ----------------------------------------------------------------------------------------------------
const english = await open(null);
await lab(english);
check(
  "a visitor in English reads the texts as they were typed",
  /Attack range/.test(await text(english, ".stats-table")) &&
    /A bow for the long evenings/.test(await text(english, ".piece-details"))
);
const arabic = await open(null, { language: "ar" });
await lab(arabic);
await askedFor(arabic, "ar");
await app.translations.sweep();
await lab(arabic);
check(
  "a visitor in Arabic reads the translated names, on a right-to-left page, and what is not translated stays as typed",
  (await arabic.locator("html").getAttribute("dir")) === "rtl" &&
    (await rowOf(arabic, "مدى الهجوم")).join("|").includes("عن بعد") &&
    /A bow for the long evenings \(ar\)/.test(await text(arabic, ".piece-details"))
);

// ---- a text written after the round has no translation yet ----------------------------------------------------------
const late = await post("/api/admin/catalog/items", {
  name: "Late charm",
  category: "regular",
  stats: [{ statId: hp, value: 10 }]
});
await french.goto(`${app.baseUrl}/build-lab?i=${late}`);
await french.waitForSelector(".stats-table");
await french.click(`.build-slot[data-piece="item:${late}"]`);
await french.waitForSelector(".piece-details");
check(
  "a new text is read as typed until the next round has translated it, the others stay translated",
  /Late charm/.test(await text(french, ".piece-details")) &&
    (await rowOf(french, "PV max")).length > 0
);

// ---- the Translations tab of the Catalog ---------------------------------------------------------------------------------
const page = await open(admin);
await page.goto(`${app.baseUrl}/catalog`);
await page.waitForSelector("[data-tab]");
await page.click('[data-tab="translations"]');
await page.waitForSelector("#tr-list .tr-row");
const counts = await page.locator(".tr-counts li b").allInnerTexts();
check(
  "the tab shows the translator, how many texts there are and how many failed",
  /Scripted service/.test(await text(page, "#tr-status")) &&
    Number(counts[0].replace(/\D/g, "")) === status.texts &&
    Number(counts[3]) === 1
);
check(
  "the tab starts with the first language that is not the one of the page",
  (await page.inputValue("#tr-language")) === "fr"
);

// a round on request: the new text is found and translated
await page.click("[data-tr-sweep]");
await toastSays(page, /translation has started/);
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("#tr-list textarea")].some(
      area => area.value === "Late charm (fr)"
    ),
  null,
  { timeout: 20000 }
);
check(
  '"Translate now" finds the new text and translates it',
  (await written(page)).includes("Late charm (fr)") &&
    /Late charm/.test(await text(page, "#tr-list"))
);

// the filters
await page.fill("#tr-search", "Max");
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length === 1);
check(
  "the filter keeps the texts that match, in the text or in its translation",
  /Max HP/.test(await text(page, "#tr-list .tr-row")) &&
    (await page.inputValue("#tr-list textarea")) === "PV max"
);
await page.fill("#tr-search", "");
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length > 3);
await page.click('[data-tr-state="failed"]');
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length === 1);
check(
  "the Failed filter lists the translation that was refused, and says why",
  new RegExp(BROKEN_TEXT.replace(/[.%]/g, "\\$&")).test(await text(page, "#tr-list .tr-row")) &&
    /The numbers are not the same as in the text\./.test(
      await text(page, "#tr-list .tr-row__error")
    )
);

// trying again what failed
provider.behaviour.changeANumber = false;
await page.click("[data-tr-retry]");
await toastSays(page, /failed texts will be tried again/);
await app.translations.sweep();
await page.click('[data-tr-state=""]');
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length > 3);
check(
  'after "Try the failed ones again" the next round translates it',
  (await app.translations.status()).total.failed === 0 &&
    (await dictionary("fr"))[BROKEN_TEXT] === "Héros à distance : 3 %."
);

// a correction by hand
const rowFor = source => page.locator(`.tr-row:has(.tr-source-text:text-is("${source}"))`);
await page.fill("#tr-search", "Max HP");
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length === 1);
await rowFor("Max HP").locator("textarea").fill("Points de vie max");
await rowFor("Max HP").locator("[data-tr-save]").click();
await toastSays(page, /Translation saved/);
await page.waitForFunction(() =>
  /By hand/.test(document.querySelector("#tr-list .tr-row .tr-row__text .hstack")?.innerText ?? "")
);
check(
  "a correction by hand is saved and marked, and visitors read it",
  (await dictionary("fr"))["Max HP"] === "Points de vie max" &&
    (await rowFor("Max HP").locator("[data-tr-reset]").count()) === 1
);
const before = provider.calls.length;
await app.translations.sweep();
check(
  "another round neither asks again nor overwrites a correction by hand",
  provider.calls.length === before && (await dictionary("fr"))["Max HP"] === "Points de vie max"
);
await lab(french);
check(
  "the visitor reads the corrected name in the build lab",
  (await rowOf(french, "Points de vie max")).length > 0
);

// back to the automatic translation
await rowFor("Max HP").locator("[data-tr-reset]").click();
await toastSays(page, /Back to the automatic translation/);
await page.waitForFunction(() =>
  /Waiting/.test(document.querySelector("#tr-list .tr-row .tr-row__text .hstack")?.innerText ?? "")
);
check(
  '"Back to automatic" empties the correction and the text waits for the next round',
  (await dictionary("fr"))["Max HP"] === undefined
);
await app.translations.sweep();
check(
  "the next round translates it again, and only it",
  provider.calls.at(-1).texts.join() === "Max HP" &&
    provider.calls.at(-1).languages.join() === "fr" &&
    (await dictionary("fr"))["Max HP"] === "PV max"
);

// a text kept as typed
await page.fill("#tr-search", "Marksman");
await page.waitForFunction(() => document.querySelectorAll("#tr-list .tr-row").length === 1);
await rowFor("Marksman").locator("[data-tr-keep]").click();
await toastSays(page, /stays as typed in every language/);
check(
  '"Keep as typed" removes the text from the dictionary of every language',
  (await dictionary("fr")).Marksman === undefined && (await dictionary("ar")).Marksman === undefined
);
await french.goto(`${app.baseUrl}/heroes`);
await french.click('.hcard[data-hero-id="h02"]');
await openHeroTab(french, "builds");
await french.waitForSelector(".build-card");
check(
  "the visitor reads that name as typed",
  /Marksman/.test(await french.locator("main").textContent()) &&
    !/Tireur/.test(await french.locator("main").textContent())
);

// another language
await page.fill("#tr-search", "");
await page.selectOption("#tr-language", "ar");
await page.waitForFunction(() =>
  [...document.querySelectorAll("#tr-list textarea")].some(area => area.value === "مدى الهجوم")
);
check(
  "the language of the list can be changed",
  /Arabic|العربية/.test(await text(page, "#tr-list .card__head h2"))
);

// ---- the languages: which are asked for, the quota, a plus button, all of them ---------------------------------------
check(
  "the tab shows the languages that are asked for, and a plus button for each of the others",
  (await page.locator(".tr-lang--on").count()) === 3 &&
    (await page.locator('[data-tr-want="ja"]').count()) === 1 &&
    (await page.locator('[data-tr-want="fr"]').count()) === 0
);
check(
  "it shows what the account of the service says about its quota",
  /12,345 of 500,000/.test(await text(page, "#tr-status")) &&
    /It stops at 90% of the quota/.test(await text(page, "#tr-status")) &&
    (await page.locator("#tr-status .tr-quota .bar").count()) === 1
);
check(
  "nothing was ever sent for a language nobody asked for",
  !provider.calls.some(call => call.languages.includes("ja"))
);
await page.click('[data-tr-want="ja"]');
await toastSays(page, /This language will be translated/);
await askedFor(page, "ja");
await app.translations.sweep();
await page.selectOption("#tr-language", "ja");
await page.waitForFunction(() =>
  [...document.querySelectorAll("#tr-list textarea")].some(area => area.value.endsWith("(ja)"))
);
check(
  "the language that was asked for is translated, and shown as asked for",
  (await page.locator('.tr-lang--on[data-code="ja"]').count()) === 1 &&
    (await dictionary("ja"))["Max HP"] === "Max HP (ja)"
);
await page.click("[data-tr-want-all]");
await toastSays(page, /Every language will be translated/);
await until(
  page,
  "every language is asked for",
  async () => (await app.translations.status()).wanted.length === 15
);
await page.waitForFunction(() => document.querySelectorAll(".tr-lang--on").length === 15);
check(
  "one button asks for all of them, and then it is gone",
  (await page.locator("[data-tr-want-all]").count()) === 0 &&
    (await page.locator("[data-tr-want]").count()) === 0
);

// ---- phone width ------
const phone = await open(admin, { width: 390 });
await phone.goto(`${app.baseUrl}/catalog`);
await phone.waitForSelector("[data-tab]");
await phone.click('[data-tab="translations"]');
await phone.waitForSelector("#tr-list .tr-row");
check("the Translations tab fits a phone", await noSideScroll(phone));

// ---- without a translation service: the tab says so, and the staff translates by hand -----------------------
const bare = await startTestServer();
const staff = await bare.signIn("Chief", { admin: true });
const armor = (
  await staff.browser.post("/api/admin/catalog/stats", { name: "Armor", unit: "whole" })
).body.id;
const plate = (
  await staff.browser.post("/api/admin/catalog/items", {
    name: "Plate",
    category: "regular",
    stats: [{ statId: armor, value: 30 }]
  })
).body.id;
const handPage = await open(staff, {}, bare);
await handPage.goto(`${bare.baseUrl}/catalog`);
await handPage.waitForSelector("[data-tab]");
await handPage.click('[data-tab="translations"]');
await handPage.waitForSelector("#tr-status");
check(
  "with no translation service the tab says automatic translation is off and how to turn it on",
  /Automatic translation is off/.test(await text(handPage, "#tr-status")) &&
    /DEEPL_API_KEY/.test(await text(handPage, "#tr-status")) &&
    (await handPage.locator("[data-tr-sweep]").textContent()).includes("Look for new texts")
);
// French is not asked for yet: the list says so and offers it; then the texts are found
check(
  "a language nobody asked for says so, and offers to translate it",
  /Nobody has asked for this language yet/.test(await text(handPage, "#tr-list")) &&
    (await handPage.locator('#tr-list [data-tr-want="fr"]').count()) === 1
);
await handPage.click('#tr-list [data-tr-want="fr"]');
await handPage.waitForSelector("#tr-list .tr-row, #tr-list p.muted:not(:has-text('Nobody'))");
await handPage.click("[data-tr-sweep]");
await handPage.waitForFunction(
  () => document.querySelector("#tr-list")?.innerText.includes("Armor"),
  null,
  { timeout: 20000 }
);
const armorRow = handPage.locator('.tr-row:has(.tr-source-text:text-is("Armor"))');
check(
  "the texts are found even then, and wait for a person",
  (await armorRow.locator("textarea").inputValue()) === "" &&
    /Waiting/.test(await armorRow.locator(".tr-row__text .hstack").innerText())
);
await armorRow.locator("textarea").fill("Armure");
await armorRow.locator("[data-tr-save]").click();
await handPage.waitForFunction(() =>
  /Translation saved/.test(document.querySelector("#toasts")?.innerText ?? "")
);
const reader = await open(null, { language: "fr" }, bare);
await reader.goto(`${bare.baseUrl}/build-lab?i=${plate}`);
await reader.waitForSelector(".stats-table");
check(
  "a translation written by hand is read by the visitors",
  /Armure/.test(await text(reader, ".stats-table"))
);

await browser.close();
await bare.close();
await app.close();
console.log(
  problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ntranslations e2e clean"
);
process.exit(problems.length ? 1 : 0);
