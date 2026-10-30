// Browser check of the personal space: a person keeps a build from the lab, sees what their space
// holds (tier lists, builds, training sheet), gives links for the parts they choose, and somebody
// without an account opens them, read only. A link that is removed opens nothing. Phone width has no
// horizontal scroll.
import { chromium } from "playwright";
import sharp from "sharp";
import { encodeBuild } from "../../../shared/build-model.js";
import { textOf } from "../../../testing/text.js";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Chief", { admin: true });
const maya = await app.signIn("Maya");

// ---- what the lab needs: two items and an arcana, with a picture -------------------------------------------
const post = async (path, body) => (await admin.browser.post(path, body)).body.id;
const hp = await post("/api/admin/catalog/stats", { name: "Max HP", sortOrder: 1 });
const upload = await fetch(`${app.baseUrl}/api/admin/catalog/images`, {
  method: "POST",
  headers: {
    "content-type": "image/png",
    cookie: `hok_session=${admin.browser.jar.get("hok_session")}`
  },
  body: await sharp({ create: { width: 64, height: 64, channels: 3, background: "#33aa77" } })
    .png()
    .toBuffer()
});
const image = (await upload.json()).id;
const boots = await post("/api/admin/catalog/items", {
  name: "Swift Boots",
  category: "boots",
  imageId: image,
  stats: [{ statId: hp, value: 100 }]
});
const blade = await post("/api/admin/catalog/items", {
  name: "Blade",
  category: "regular",
  imageId: image,
  stats: [{ statId: hp, value: 10 }]
});
const zeal = await post("/api/admin/catalog/arcana", {
  name: "Zeal",
  color: "red",
  imageId: image,
  stats: [{ statId: hp, value: 2 }]
});
const labAddress = `/build-lab?${(() => {
  const params = encodeBuild({
    items: [boots, blade],
    utility: [],
    late: [],
    core: [boots, blade],
    arcana: { red: [{ id: zeal, count: 3 }], blue: [], green: [] }
  });
  params.set("h", "h05");
  return params.toString();
})()}`;

// ---- what Maya has already, kept on the site elsewhere than in her space ---------------------------------------
await maya.browser.post("/api/tier-lists", {
  name: "Mid picks",
  tiers: [
    { id: "s", label: "S", heroes: ["h01", "h02"] },
    { id: "a", label: "A", heroes: ["h03"] }
  ],
  unranked: []
});
await maya.browser.put("/api/training/focus", { heroIds: ["h03", "h04"] });
await maya.browser.post("/api/training/notes", {
  kind: "goal",
  title: "Wave control",
  body: "Freeze the wave at 4:00",
  heroId: "h03"
});
await maya.browser.post("/api/training/reflex/runs", {
  exercise: "reaction",
  score: 243,
  durationMs: 14_000
});
await app.store.saveHeroDetails("h01", {
  skills: [
    {
      id: "1101",
      index: 1,
      type: "skill",
      label: "Skill 1",
      name: "Dash",
      icon: null,
      description: [{ t: "Dash.", c: null }],
      cost: null,
      cooldownSeconds: 5,
      tags: [],
      video: null
    }
  ]
});
const combo = await admin.browser.post("/api/combos/h01", {
  name: "Burst",
  steps: [{ skillId: "1101" }]
});
await maya.browser.put(`/api/training/combos/${combo.body.id}`, { normal: true });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const open = async (who, width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  if (who) {
    await context.addCookies([
      { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
  const page = await context.newPage();
  page.requests = [];
  page.on("request", request => page.requests.push(request.url()));
  page.on("console", message => {
    // a link that shares nothing is refused (400) and a removed one is gone (404), on purpose:
    // the page says so
    if (
      ["error", "warning"].includes(message.type()) &&
      !/Failed to load resource.*\b(400|404)\b/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
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
const text = textOf;

// ---- without an account ---------------------------------------------------------------------------------------------
const guest = await open(null);
await guest.goto(`${app.baseUrl}${labAddress}`);
await guest.waitForSelector("#my-builds");
await guest.fill("#lab-keep-name", "Local");
await guest.click('#lab-keep button[value="new"]');
await guest.waitForSelector("#my-builds .saved-row");
check(
  "without an account a build is kept in the browser, with no button for a space it cannot have; the note says to sign in",
  (await guest.locator("[data-saved-space]").count()) === 0 &&
    /Sign in to keep builds in your space/.test(await text(guest, "#my-builds"))
);
await guest.goto(`${app.baseUrl}/space`);
await guest.waitForSelector(".sign-in-prompt");
check(
  "the space page asks to sign in",
  (await guest.locator('.sign-in-prompt a[href="/login?next=%2Fspace"]').count()) === 1 &&
    (await guest.locator("#nav-space[hidden]").count()) === 1
);

// ---- keeping a build from the lab ----------------------------------------------------------------------------------------
const page = await open(maya);
await page.goto(`${app.baseUrl}${labAddress}`);
await page.waitForSelector("#my-builds");
await page.fill("#lab-keep-name", "Burst");
await page.click('#lab-keep button[value="new"]');
await page.waitForSelector("#my-builds .saved-row");
check(
  "signed in, each kept build has a button to keep it in the space, and the note explains it",
  (await page.locator("#my-builds [data-saved-space]").count()) === 1 &&
    /keep it in your space/.test(await text(page, "#my-builds"))
);
const answer = page.waitForResponse(
  reply => reply.url().endsWith("/api/space/builds") && reply.request().method() === "POST"
);
await page.click("#my-builds [data-saved-space]");
check("keeping a build is saved on the account", (await answer).status() === 200);
check(
  "and the build of the browser stays where it is",
  (await page.locator("#my-builds .saved-row").count()) === 1 &&
    /Kept in your space/.test(await text(page, "#toasts"))
);

// ---- the space page ------------------------------------------------------------------------------------------------------------
await page.goto(`${app.baseUrl}/space`);
// the frame already has the first lines of the share band (#sp-share): the page is there once its form is
await page.waitForSelector("#sp-link-form");
check(
  "the space is in the menu and has a card for each thing that can be shared, with what the person has",
  (await page.locator("#nav-space:not([hidden])").count()) === 1 &&
    (await page.locator("#sp-tier-lists, #sp-builds, #sp-training").count()) === 3 &&
    /Mid picks/.test(await text(page, "#sp-tier-lists")) &&
    (await page.locator("#sp-tier-lists .sp-tier").count()) === 2
);
check(
  "the kept build is there with its pieces, and a way into the lab",
  /Burst/.test(await text(page, "#sp-builds")) &&
    (await page.locator("#sp-builds .build-view .slot-item").count()) === 2 &&
    (await page.locator('#sp-builds .sp-build a[href^="/build-lab?"]').count()) === 1
);
check(
  "the training sheet shows the heroes worked on, the notebook, the combos acquired and the best reflex scores",
  (await page.locator("#sp-training .sp-heroes .pt").count()) === 2 &&
    /Wave control/.test(await text(page, "#sp-training")) &&
    /Burst/.test(await text(page, "#sp-training")) &&
    /243 ms/.test(await text(page, "#sp-training"))
);
check(
  "no link yet: the card says nobody can see the space",
  /nobody can see your space/.test(await text(page, "#sp-share"))
);

// ---- giving a link --------------------------------------------------------------------------------------------------------------
await page.fill('#sp-link-form input[name="label"]', "For my coach");
await page.selectOption('#sp-link-form select[name="days"]', "7");
await page.click('#sp-link-form button[type="submit"]');
await page.waitForSelector("#sp-fresh-address");
const address = await page.inputValue("#sp-fresh-address");
check(
  "a link is given: its address has the token after a #, so that no server ever receives it",
  new RegExp(`^${app.baseUrl}/space/shared#sp_[A-Za-z0-9_-]{32}$`).test(address)
);
check(
  "it is listed with its name, what it shares and when it ends; the card says it is shown once",
  (await page.locator("#sp-share .sp-link").count()) === 1 &&
    /For my coach/.test(await text(page, "#sp-share .sp-link")) &&
    /Ends on/.test(await text(page, "#sp-share .sp-link")) &&
    /Never opened/.test(await text(page, "#sp-share .sp-link")) &&
    /only once/.test(await text(page, "#sp-fresh"))
);
await page.reload();
await page.waitForSelector("#sp-share .sp-link");
check(
  "after a reload the address is gone for good: the list shows no token",
  (await page.locator("#sp-fresh-address").count()) === 0 &&
    !(await page.content()).includes(address.split("#")[1])
);

// ---- opening it, without an account ---------------------------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(address);
await visitor.waitForSelector("#sp-training");
const token = address.split("#")[1];
check(
  "the person who has the link sees the space of its owner, read only, in the three parts",
  /Space of Maya/.test(await text(visitor, "h1")) &&
    (await visitor.locator("#sp-share").count()) === 0 &&
    (await visitor.locator("#sp-tier-lists, #sp-builds, #sp-training").count()) === 3 &&
    (await visitor.locator("[data-sp-remove-build], [data-sp-remove-link]").count()) === 0
);
check(
  "with the same content: the tier list with its heroes, the build with its pieces, the training sheet",
  /Mid picks/.test(await text(visitor, "#sp-tier-lists")) &&
    (await visitor.locator("#sp-tier-lists .sp-heroes .pt").count()) === 3 &&
    (await visitor.locator("#sp-builds .build-view .slot-item").count()) === 2 &&
    /Wave control/.test(await text(visitor, "#sp-training")) &&
    /243 ms/.test(await text(visitor, "#sp-training"))
);
check(
  "the token never travelled in an address: no request of the page has it, and nothing says the e-mail",
  !visitor.requests.some(url => url.includes(token)) &&
    !(await visitor.content()).includes("@example.test")
);
// the page is indexable on purpose (a Lighthouse SEO of 100): the secret of the link is after the #, which no server ever
// receives, so a search engine only ever sees the same empty page as everybody. The owner's content is what the checks
// just above hold back; going back to noindex is `index: false` in shared/routes.js and the opposite assertion here.
check(
  "a shared space is the same indexable page for everybody: the link is after the #, so nothing of the owner is in it",
  /^index/.test((await visitor.locator('meta[name="robots"]').getAttribute("content")) ?? "")
);
check(
  "opening it needs no account and gives none: no session cookie was set",
  !(await visitor.context().cookies()).some(cookie => /session/i.test(cookie.name))
);

// ---- a link for one part only ------------------------------------------------------------------------------------------------
await page.goto(`${app.baseUrl}/space`);
await page.waitForSelector("#sp-link-form");
await page.uncheck('#sp-link-form input[value="tierLists"]');
await page.uncheck('#sp-link-form input[value="training"]');
await page.click('#sp-link-form button[type="submit"]');
await page.waitForSelector("#sp-fresh-address");
const buildsOnly = await page.inputValue("#sp-fresh-address");
await visitor.goto(buildsOnly);
await visitor.waitForSelector("#sp-builds");
check(
  "a link made for the builds only shows nothing else",
  (await visitor.locator("#sp-tier-lists").count()) === 0 &&
    (await visitor.locator("#sp-training").count()) === 0 &&
    (await visitor.locator("#sp-builds").count()) === 1
);
await page.check('#sp-link-form input[value="tierLists"]');
await page.check('#sp-link-form input[value="training"]');
await page.uncheck('#sp-link-form input[value="builds"]');
await page.uncheck('#sp-link-form input[value="tierLists"]');
await page.uncheck('#sp-link-form input[value="training"]');
await page.click('#sp-link-form button[type="submit"]');
await page.waitForFunction(
  () => document.querySelector("#sp-error")?.textContent.trim().length > 0
);
check(
  "a link that shares nothing is refused, with the reason",
  /Choose what the link shares/.test(await text(page, "#sp-error"))
);

// ---- the opened counter, then removing -------------------------------------------------------------------------------------
await page.reload();
await page.waitForSelector("#sp-share .sp-link");
check(
  "the owner sees how many times each link was opened",
  /Opened 1 time/.test(await text(page, "#sp-share")) ||
    /Opened 2 times/.test(await text(page, "#sp-share"))
);
page.once("dialog", dialog => dialog.dismiss());
await page.locator("#sp-share [data-sp-remove-link]").first().click();
check(
  "removing a link asks first: nothing goes when the answer is no",
  (await page.locator("#sp-share .sp-link").count()) === 2
);
// the first link is the one given last (the one for the builds): remove the first one that was given
page.once("dialog", dialog => dialog.accept());
await page.locator("#sp-share [data-sp-remove-link]").nth(1).click();
await page.waitForFunction(() => document.querySelectorAll("#sp-share .sp-link").length === 1);
await visitor.goto(address);
await visitor.waitForSelector(".empty");
check(
  "a link that was removed opens nothing: the page says the space is not available",
  /not available/.test(await text(visitor, "main")) &&
    (await visitor.locator("#sp-builds").count()) === 0
);
await visitor.goto(`${app.baseUrl}/space/shared`);
await visitor.waitForSelector(".empty");
check("an address without a link in it says so", /no link in it/.test(await text(visitor, "main")));
await visitor.goto(`${app.baseUrl}/space/shared#sp_not-a-real-token-at-all-0000000000`);
await visitor.waitForSelector(".empty");
check("a made-up link opens nothing either", /not available/.test(await text(visitor, "main")));

// ---- removing a kept build ------------------------------------------------------------------------------------------------
await page.reload();
await page.waitForSelector("#sp-builds [data-sp-remove-build]");
page.once("dialog", dialog => dialog.accept());
await page.click("#sp-builds [data-sp-remove-build]");
await page.waitForFunction(() =>
  /No build kept yet/.test(document.querySelector("#sp-builds")?.innerText ?? "")
);
check("a kept build is removed from the space", true);

// ---- phone width -------------------------------------------------------------------------------------------------------------------
await maya.browser.post("/api/space/builds", {
  heroId: "h05",
  name: "Burst",
  level: 15,
  build: {
    items: [boots, blade],
    utility: [],
    late: [],
    core: [boots],
    arcana: { red: [{ id: zeal, count: 3 }], blue: [], green: [] }
  }
});
const { token: phoneToken } = (
  await maya.browser.post("/api/space/links", { sections: ["tierLists", "builds", "training"] })
).body;
const phone = await open(maya, 390);
await phone.goto(`${app.baseUrl}/space`);
await phone.waitForSelector("#sp-builds .build-view");
check("the space page has no horizontal scroll on a phone", await noSideScroll(phone));
const phoneVisitor = await open(null, 390);
await phoneVisitor.goto(`${app.baseUrl}/space/shared#${phoneToken}`);
await phoneVisitor.waitForSelector("#sp-builds .build-view");
check("the page of a link has no horizontal scroll on a phone", await noSideScroll(phoneVisitor));

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nspace e2e clean");
process.exit(problems.length ? 1 : 0);
