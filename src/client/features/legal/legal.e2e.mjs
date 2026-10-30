// Browser check of the legal pages and the contact form: the footer reaches the five pages, each one draws its text (the
// English reference in a language that has no text of its own, French in French), the registration page says what an
// account means, a message sent from the contact page reaches an administrator, and a program that fills the hidden
// field is told it worked while nothing is kept.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const admin = await app.signIn("Keeper", { admin: true });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();
const open = async (cookies = [], width = 1440) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: app.baseUrl })));
  const page = await context.newPage();
  page.on("console", message => {
    if (
      ["error", "warning"].includes(message.type()) &&
      !/status of 40[0-9]|Failed to load resource/.test(message.text())
    ) {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  return page;
};

// ---- the footer and the five pages ------------------------------------------------------------------------------
const visitor = await open();
await visitor.goto(`${app.baseUrl}/`);
await visitor.waitForSelector("html[data-ready='1']");
check(
  "the footer links to the five legal pages",
  (
    await visitor.locator(".sitefoot__links a").evaluateAll(links => links.map(a => a.pathname))
  ).join(",") === "/terms,/privacy,/cookies,/legal,/contact"
);
for (const [path, heading] of [
  ["/terms", "Terms of use"],
  ["/privacy", "Privacy policy"],
  ["/cookies", "Cookies and local storage"],
  ["/legal", "Legal notice"],
  ["/contact", "Contact"]
]) {
  await visitor.goto(`${app.baseUrl}${path}`);
  await visitor.waitForSelector(".legal-doc");
  check(
    `${path} draws its title and a text, and the tab of the page is the current one`,
    (await visitor.locator("h1").textContent()) === heading &&
      (await visitor.locator(".legal-doc").innerText()).length > 150 &&
      (await visitor.locator('.legal-nav a[aria-current="page"]').getAttribute("href")) === path
  );
  check(
    `${path} has its own title for the browser and is allowed in the index`,
    (await visitor.title()).includes(heading) &&
      !(await visitor.locator('meta[name="robots"]').getAttribute("content")).includes("noindex")
  );
}
// a missing fact shows as a visible mark, never as a blank (until the owner fills legal-info.js in)
await visitor.goto(`${app.baseUrl}/legal`);
await visitor.waitForSelector(".legal-doc");
check(
  "a fact that is not written yet shows the 'to complete' mark",
  (await visitor.locator(".legal-todo").count()) > 0 ||
    !/\{\w+\}/.test(await visitor.locator(".legal-doc").innerText())
);
check(
  "no placeholder token is left in the text",
  !/\{\w+\}/.test(await visitor.locator(".legal-doc").innerText())
);

// ---- languages ----------------------------------------------------------------------------------------------------------
const french = await open([{ name: "hok_lang", value: "fr" }]);
await french.goto(`${app.baseUrl}/privacy`);
await french.waitForSelector(".legal-doc");
check(
  "in French the policy is the French text, with no 'reference' note",
  /Responsable du traitement/i.test(await french.locator(".legal-doc").innerText()) &&
    (await french.locator(".legal-ref").count()) === 0
);
const german = await open([{ name: "hok_lang", value: "de" }]);
await german.goto(`${app.baseUrl}/privacy`);
await german.waitForSelector(".legal-doc");
check(
  "in German the English reference is shown, under a line (in German) that says so",
  /Who is responsible/i.test(await german.locator(".legal-doc").innerText()) &&
    (await german.locator(".legal-ref").count()) === 1 &&
    /Englisch/.test(await german.locator(".legal-ref").innerText())
);

// ---- the registration page ------------------------------------------------------------------------------------------
await visitor.goto(`${app.baseUrl}/register`);
await visitor.waitForSelector(".au-legal");
check(
  "the registration page says that creating an account accepts the terms and the policy",
  (await visitor.locator('.au-legal a[href="/terms"]').count()) >= 2 &&
    (await visitor.locator('.au-legal a[href="/privacy"]').count()) >= 2 &&
    /accept/.test(await visitor.locator(".au-legal").innerText())
);

// ---- the contact form ----------------------------------------------------------------------------------------------
await visitor.goto(`${app.baseUrl}/contact`);
await visitor.waitForSelector("#contact-form");
await visitor.fill("#contact-name", "Ada");
await visitor.fill("#contact-email", "ada@example.com");
await visitor.fill("#contact-subject", "A question");
await visitor.fill("#contact-message", "Hello,\nis the tier list updated each patch?");
await visitor.click('#contact-form button[type="submit"]');
await visitor.waitForSelector("#contact-sent:not([hidden])");
check(
  "a message is sent and the form says thank you",
  await visitor.locator("#contact-form").isHidden()
);
const listed = await admin.browser.get("/api/admin/contact");
check(
  "an administrator reads it, with the line break kept",
  listed.body.items.length === 1 &&
    listed.body.items[0].subject === "A question" &&
    listed.body.items[0].message.includes("\n") &&
    listed.body.items[0].email === "ada@example.com" &&
    listed.body.open === 1
);
const stranger = await open();
const refused = await stranger.request.get(`${app.baseUrl}/api/admin/contact`);
check("a visitor cannot read the messages", refused.status() === 401);
const trap = await stranger.request.post(`${app.baseUrl}/api/contact`, {
  data: {
    name: "Bot",
    email: "bot@example.com",
    subject: "Buy",
    message: "Buy cheap things at this address",
    website: "http://spam.example"
  }
});
check("a program that fills the hidden field is told it worked", trap.status() === 200);
check(
  "...and nothing was kept",
  (await admin.browser.get("/api/admin/contact")).body.items.length === 1
);
const invalid = await stranger.request.post(`${app.baseUrl}/api/contact`, {
  data: { name: "X", email: "not an address", subject: "S", message: "long enough message" }
});
check("a wrong address is refused", invalid.status() === 400);
const short = await stranger.request.post(`${app.baseUrl}/api/contact`, {
  data: { name: "X", email: "x@example.com", subject: "S", message: "short" }
});
check("a message that is too short is refused", short.status() === 400);

// the administrator marks it handled, then deletes it
const id = listed.body.items[0].id;
const handled = await admin.browser.patch(`/api/admin/contact/${id}`, { handled: true });
check(
  "an administrator marks a message as handled",
  handled.status === 200 && (await admin.browser.get("/api/admin/contact")).body.open === 0
);
const removed = await admin.browser.delete(`/api/admin/contact/${id}`);
check(
  "...and deletes it",
  removed.status === 200 && (await admin.browser.get("/api/admin/contact")).body.total === 0
);

// ---- a phone ---------------------------------------------------------------------------------------------------------------
const phone = await open([], 390);
await phone.goto(`${app.baseUrl}/privacy`);
await phone.waitForSelector(".legal-doc");
check(
  "on a phone: no sideways scroll, and the footer ends above the tab bar",
  (await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) &&
    (await (async () => {
      await phone.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const foot = await phone.locator(".sitefoot__note").boundingBox();
      const bar = await phone.locator(".tabbar").boundingBox();
      return foot.y + foot.height <= bar.y;
    })())
);

await browser.close();
await app.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall good");
