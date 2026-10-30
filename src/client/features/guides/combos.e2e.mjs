// Browser check of the combos of the heroes: an editor writes them on the guides page (a form with the
// pictures of the skills, order, edit, delete), everybody reads them on the page of the hero (the first
// ones open, the others folded), and a signed-in player validates each one in two forms in the
// training area: as it is, and with the animation cancelled. Phone width has no horizontal scroll.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { openHeroTab } from "../../../testing/nav.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const helper = await app.signIn("Helper");
const trainee = await app.signIn("Trainee");
const other = await app.signIn("Other");
await admin.browser.put(`/api/admin/players/${helper.user.tag}/labels`, {
  labels: ["contributor"]
});

// The sheet of the first hero, as Camp would give it: a passive, three skills and an ultimate. The
// pictures are not reachable in a test, the frames fall back to plain discs.
const skill = (id, index, type, name) => ({
  id,
  index,
  type,
  label: type === "passive" ? "Passive" : `Skill ${index}`,
  name,
  icon: null,
  description: [{ t: `${name}.`, c: null }],
  cost: null,
  cooldownSeconds: 5,
  tags: [],
  video: null
});
await app.store.saveHeroDetails("h01", {
  schema: 1,
  skills: [
    skill("1100", 0, "passive", "Aura"),
    skill("1101", 1, "skill", "Dash"),
    skill("1102", 2, "skill", "Slam"),
    skill("1103", 3, "skill", "Spin"),
    skill("1104", 4, "ultimate", "Burst")
  ],
  adjustments: [],
  adjustmentsDetailed: false,
  world: { region: "", identity: "", height: "", energy: "", video: null },
  mainClass: "",
  minorClass: "",
  lane: "",
  listedAt: null,
  gallery: [],
  art: {}
});

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1100 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.on("console", message => {
    // the refused change of a combo that is gone is expected (404), and says so on the screen
    if (
      ["error", "warning"].includes(message.type()) &&
      !/Failed to load resource.*404/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};
// A hero page is reached from the list of heroes, as a person would (the test heroes have no
// numeric id, which the address of a sheet asks for).
const openHero = async (page, heroId) => {
  await page.goto(`${app.baseUrl}/heroes`);
  await page.click(`.hcard[data-hero-id="${heroId}"]`);
  await openHeroTab(page, "combos");
  await page.waitForSelector("#hero-combos");
};
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
const combosOf = async heroId => (await app.browser().get(`/api/heroes/${heroId}`)).body.combos;

// ---- the editor writes a combo ---------------------------------------------------------------------
const page = await open(helper);
await page.goto(`${app.baseUrl}/guides/h01?tab=combos`);
await page.waitForSelector("[data-cb-new]");
check(
  "the link of the combos opens the Combos section of the hero, empty at first",
  // the tabs are written in capitals by the style: the text is read as the page holds it, then the count
  /^Combos\b/.test(await textOf(page, ".bed-sections button.on")) &&
    /No combo yet/.test(await page.locator("#cb-root").innerText()) &&
    (await page.locator("#nav-guides:not([hidden])").count()) === 1
);
await page.click("[data-cb-new]");
await page.waitForSelector("#cb-name");
check(
  "a new combo opens a form with the passive, the skills of the hero and its basic attack as pictures",
  (await page.locator(".bed-pal").count()) === 6 &&
    (await page.locator('.bed-pal[data-cb-add="basic"]').getAttribute("aria-label")) ===
      "Basic attack" &&
    (await page.locator('.bed-pal[data-cb-add="1100"]').getAttribute("aria-label")) === "Aura" &&
    (await page.locator("[data-cb-save]").isDisabled()) &&
    (await page.locator(".bed-checks li.todo").count()) === 2
);
await page.click('[data-cb-add="1101"]');
await page.click('[data-cb-add="1102"]');
await page.click('[data-cb-add="1101"]');
await page.click('[data-cb-add="basic"]');
await page.fill('[data-cb-hint="1"]', "after the stun");
check(
  "the steps are listed in the order they were picked, a skill may come twice, the basic attack is a step, the counter follows",
  (await page.locator("#cb-steps li").count()) === 4 &&
    (await page.locator("#cb-steps .combo-pic--basic").count()) === 1 &&
    /4 of 12 steps/.test(await page.locator("#cb-form .card__head").innerText())
);
check(
  "without a name the combo cannot be saved; the rule that is not met is still listed",
  (await page.locator("[data-cb-save]").isDisabled()) &&
    (await page.locator(".bed-checks li.todo").count()) === 1
);
await page.fill("#cb-name", "Burst");
check("with a name and a step it can", await page.locator("[data-cb-save]").isEnabled());
await page.click("[data-cb-save]");
await page.waitForSelector(".bed-combo");
const saved = await combosOf("h01");
check(
  "saving writes it on the page of the hero, steps and hint included",
  saved.length === 1 &&
    saved[0].name === "Burst" &&
    saved[0].steps.map(step => step.skillId).join() === "1101,1102,1101,basic" &&
    saved[0].steps[1].hint === "after the stun"
);
check(
  "the list shows the combo as a strip of numbered pictures with its hint; the form is closed",
  (await page.locator(".bed-combo .combo-step").count()) === 4 &&
    (await page.locator(".bed-combo .combo-pic--basic").count()) === 1 &&
    (await page.locator(".bed-combo .combo-step__num").allInnerTexts()).join() === "1,2,3,4" &&
    /after the stun/.test(await page.locator(".bed-combo").innerText()) &&
    (await page.locator("#cb-form").count()) === 0
);
check(
  "the list of heroes counts it",
  (await page.locator(".bed-hero.active .pill").nth(1).textContent()).trim() === "1"
);

// ---- more of them: reorder, edit, delete --------------------------------------------------------------
const write = (name, ...ids) =>
  admin.browser.post("/api/combos/h01", { name, steps: ids.map(skillId => ({ skillId })) });
for (const [name, ids] of [
  ["Poke", ["1103"]],
  ["Chase", ["1101", "1103", "1104"]],
  ["Escape", ["1102", "1101"]],
  ["Wave clear", ["1104"]],
  ["Team fight", ["1100", "1104", "1103"]]
]) {
  await write(name, ...ids);
}
await page.reload();
await page.waitForSelector(".bed-combo");
check(
  "as many combos as the editors want: six are listed, in the order they were written",
  (await page.locator(".bed-combo").count()) === 6 &&
    (await page.locator(".bed-combo__head b").allInnerTexts()).join() ===
      "Burst,Poke,Chase,Escape,Wave clear,Team fight"
);
const first = (await combosOf("h01"))[0];
await page.click(`[data-cb-down="${first.id}"]`);
await page.waitForFunction(
  () => document.querySelectorAll(".bed-combo__head b")[1]?.textContent === "Burst"
);
check(
  "moving a combo down changes the order for everybody, and the focus stays on the button",
  (await combosOf("h01"))
    .map(combo => combo.name)
    .slice(0, 2)
    .join() === "Poke,Burst" &&
    (await page.evaluate(() => document.activeElement?.dataset.cbDown)) === first.id
);

await page.click(`[data-cb-edit="${first.id}"]`);
await page.waitForSelector("#cb-name");
check(
  "editing opens the form with the name and the steps of the combo",
  (await page.inputValue("#cb-name")) === "Burst" &&
    (await page.locator("#cb-steps li").count()) === 4 &&
    (await page.inputValue('[data-cb-hint="1"]')) === "after the stun"
);
await page.fill("#cb-name", "Burst 2");
await page.click('[data-cb-step-remove="3"]');
await page.click('[data-cb-step-remove="2"]');
check(
  "a step is removed, the counter and the rules follow",
  (await page.locator("#cb-steps li").count()) === 2 &&
    /2 of 12 steps/.test(await page.locator("#cb-form .card__head").innerText())
);
page.once("dialog", dialog => dialog.dismiss());
await page.click("[data-cb-cancel]");
check(
  "cancelling with unsaved changes asks first: staying keeps the form",
  (await page.locator("#cb-form").count()) === 1 &&
    (await page.inputValue("#cb-name")) === "Burst 2"
);
await page.click("[data-cb-save]");
await page.waitForFunction(() => !document.querySelector("#cb-form"));
const edited = await combosOf("h01");
check(
  "saving changes the combo where it is: same place, new name, one step less",
  edited[1].name === "Burst 2" &&
    edited[1].id === first.id &&
    edited[1].steps.length === 2 &&
    edited.length === 6
);

const poke = edited[0];
page.once("dialog", dialog => dialog.accept());
await page.click(`[data-cb-remove="${poke.id}"]`);
await page.waitForFunction(() => document.querySelectorAll(".bed-combo").length === 5);
check(
  "deleting a combo asks first, then removes it",
  (await combosOf("h01")).length === 5 && !(await combosOf("h01")).some(c => c.id === poke.id)
);

// unsaved changes are not lost by a mistaken click on another hero
await page.click("[data-cb-new]");
await page.fill("#cb-name", "Draft");
page.once("dialog", dialog => dialog.dismiss());
await page.click('.bed-hero[data-bed-hero="h02"]');
check(
  "another hero is not opened over an unsaved combo when the answer is no",
  /\/guides\/h01\?tab=combos$/.test(page.url()) && (await page.inputValue("#cb-name")) === "Draft"
);
page.once("dialog", dialog => dialog.accept());
await page.click('.bed-hero[data-bed-hero="h02"]');
await page.waitForFunction(() => location.pathname === "/guides/h02");
check(
  "and it is when the answer is yes, in the same section",
  /\/guides\/h02\?tab=combos$/.test(page.url()) &&
    /^Combos\b/.test(await textOf(page, ".bed-sections button.on"))
);
await page.waitForFunction(() =>
  /not been fetched/.test(document.querySelector("#cb-root")?.innerText ?? "")
);
check(
  "a hero whose sheet has not been fetched cannot get combos (nothing to pick from), and says why",
  (await page.locator("[data-cb-new]").count()) === 0
);

// ---- everybody reads them on the page of the hero -----------------------------------------------------
const visitor = await open(null);
await openHero(visitor, "h01");
await visitor.waitForSelector("#hero-combos .combo-row");
check(
  "the page of the hero has a Combos card with the first four combos open and the rest folded",
  (await visitor.locator("#hero-combos > .combo-list > .combo-row").count()) === 4 &&
    (await visitor.locator("#hero-combos details.combo-more .combo-row").count()) === 1 &&
    /More combos \(1\)/.test(await visitor.locator("details.combo-more summary").innerText())
);
const row = visitor.locator("#hero-combos .combo-row").first();
check(
  "each combo shows its name and its steps as numbered pictures named after the skills",
  (await row.locator("h3").innerText()).toLowerCase() === "burst 2" && // headings are drawn in capitals
    (await row.locator(".combo-step").count()) === 2 &&
    (await row.locator(".combo-pic").first().getAttribute("aria-label")) === "Dash" &&
    (await row.locator(".combo-step__num").allInnerTexts()).join() === "1,2"
);
check("the hint of a step is under its picture", /after the stun/.test(await row.innerText()));
await visitor.click("details.combo-more summary");
check(
  "the folded combos open with a click",
  await visitor.locator("details.combo-more .combo-row").first().isVisible()
);
check(
  "there is a Combos tab among the sections of the hero, and no editing link for a visitor",
  (await visitor.locator('.hero-tabs button[data-target="hero-combos"]').count()) === 1 &&
    (await visitor.locator('#hero-combos a[href*="guides"]').count()) === 0 &&
    (await visitor.locator('#hero-combos a[href*="training"]').count()) === 0
);
await openHero(visitor, "h02");
check(
  "a hero without combos says so, and invents nothing",
  /No combo has been written for this hero yet/.test(
    await visitor.locator("#hero-combos").innerText()
  )
);
const writer = await open(helper);
await openHero(writer, "h01");
await writer.waitForSelector("#hero-combos .combo-row");
check(
  "an editor has a link that opens the combos of the hero in the editor",
  (await writer.locator('#hero-combos a[href="/guides/h01?tab=combos"]').count()) === 1
);

// ---- a player validates them in training ----------------------------------------------------------------
const train = await open(trainee);
await openHero(train, "h01");
await train.waitForSelector("#hero-combos .combo-row");
check(
  "a signed-in player has a link to practise the combos",
  (await train.locator('#hero-combos a[href="/training?hero=h01"]').count()) === 1
);
await train.click('#hero-combos a[href="/training?hero=h01"]');
await train.waitForSelector(".combo-train");
check(
  "the link opens the hero in the training area with its combos, each with two forms to validate",
  (await train.locator(".combo-train").count()) === 5 &&
    (await train.locator(".combo-train").first().locator("[data-form]").count()) === 2 &&
    (await train.locator(".combo-train [data-form][aria-pressed='true']").count()) === 0 &&
    /Normal · 0 \/ 5/.test(await train.locator("[data-tally='normal']").innerText()) &&
    /Animation cancel · 0 \/ 5/.test(
      await train.locator("[data-tally='animationCancel']").innerText()
    )
);
const toggle = async (locator, page = train) => {
  const [response] = await Promise.all([
    page.waitForResponse(
      reply => reply.request().method() === "PUT" && reply.url().includes("/api/training/combos/")
    ),
    locator.click()
  ]);
  return response.status();
};
const firstRow = train.locator(".combo-train").first();
check(
  "validating the normal form is saved",
  (await toggle(firstRow.locator('[data-form="normal"]'))) === 200
);
check(
  "the button shows it and the tally follows",
  (await firstRow.locator('[data-form="normal"]').getAttribute("aria-pressed")) === "true" &&
    (await firstRow.locator('[data-form="animationCancel"]').getAttribute("aria-pressed")) ===
      "false" &&
    /Normal · 1 \/ 5/.test(await train.locator("[data-tally='normal']").innerText())
);
check(
  "validating the animation cancel form is saved too, on its own",
  (await toggle(firstRow.locator('[data-form="animationCancel"]'))) === 200 &&
    (await firstRow.locator("[data-form][aria-pressed='true']").count()) === 2
);
await toggle(train.locator(".combo-train").nth(2).locator('[data-form="animationCancel"]'));
const firstId = (await combosOf("h01"))[0].id;
const progress = (await trainee.browser.get("/api/training/combos?heroId=h01")).body.progress;
check(
  "the server keeps what was validated, per combo and per form",
  JSON.stringify(progress[firstId]) === JSON.stringify({ normal: true, animationCancel: true }) &&
    Object.keys(progress).length === 2
);
await train.reload();
await train.waitForSelector(".combo-train");
check(
  "it is still there after a reload",
  (await train
    .locator(".combo-train")
    .first()
    .locator("[data-form][aria-pressed='true']")
    .count()) === 2 &&
    /Animation cancel · 2 \/ 5/.test(
      await train.locator("[data-tally='animationCancel']").innerText()
    )
);
await toggle(train.locator(".combo-train").first().locator('[data-form="normal"]'));
check(
  "a form can be taken back",
  (await train
    .locator(".combo-train")
    .first()
    .locator('[data-form="normal"]')
    .getAttribute("aria-pressed")) === "false" &&
    /Normal · 0 \/ 5/.test(await train.locator("[data-tally='normal']").innerText())
);

const elsewhere = await open(other);
await elsewhere.goto(`${app.baseUrl}/training?hero=h01`);
await elsewhere.waitForSelector(".combo-train");
check(
  "another player has nothing validated: it is personal",
  (await elsewhere.locator(".combo-train [data-form][aria-pressed='true']").count()) === 0
);

// a combo that was deleted meanwhile: the change is refused and the button goes back
const gone = (await combosOf("h01")).at(-1);
await admin.browser.delete(`/api/combos/h01/${gone.id}`);
const lastRow = train.locator(".combo-train").last();
const status = await toggle(lastRow.locator('[data-form="normal"]'));
check(
  "a combo that has been deleted meanwhile cannot be validated: the button goes back, and says why",
  status === 404 &&
    (await lastRow.locator('[data-form="normal"]').getAttribute("aria-pressed")) === "false" &&
    /Combo not found/.test(await train.locator("#toasts").innerText())
);

// ---- phone width ----------------------------------------------------------------------------------------
const phone = await open(trainee, 390);
await openHero(phone, "h01");
await phone.waitForSelector("#hero-combos .combo-row");
check(
  "the page of a hero with combos has no horizontal scroll on a phone",
  await noSideScroll(phone)
);
await phone.goto(`${app.baseUrl}/training?hero=h01`);
await phone.waitForSelector(".combo-train");
check(
  "the training sheet with combos has no horizontal scroll on a phone",
  await noSideScroll(phone)
);
const editorPhone = await open(helper, 390);
await editorPhone.goto(`${app.baseUrl}/guides/h01?tab=combos`);
await editorPhone.waitForSelector("[data-cb-new]");
await editorPhone.click("[data-cb-new]");
await editorPhone.waitForSelector("#cb-name");
check(
  "the combos editor with its form open has no horizontal scroll on a phone",
  await noSideScroll(editorPhone)
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ncombos e2e clean");
process.exit(problems.length ? 1 : 0);
