// Browser check of the API keys: a signed-in person makes a key in Settings, copies it once, uses it
// against /api/v1, and revokes it; a visitor has no such section.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";

const app = await startTestServer();
const user = await app.signIn("Keymaker");
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();
const open = async account => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.baseUrl });
  if (account) {
    await context.addCookies([
      { name: "hok_session", value: account.browser.jar.get("hok_session"), url: app.baseUrl }
    ]);
  }
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
const ready = page => page.waitForSelector("html[data-ready='1']", { timeout: 15000 });

// ---- a visitor has no keys ----------------------------------------------------------------------
const visitor = await open(null);
await visitor.goto(`${app.baseUrl}/settings`);
await ready(visitor);
check("a visitor sees no API section", (await visitor.locator("#settings-api").count()) === 0);

// ---- a signed-in person makes a key -------------------------------------------------------------
const page = await open(user);
await page.goto(`${app.baseUrl}/settings`);
await ready(page);
await page.waitForSelector("#ak-form");
check(
  "the section lists no key yet and says how to make one",
  (await page.locator(".ak-key").count()) === 0 &&
    (await page.locator("#ak-form [data-ak-create]").isEnabled())
);
check(
  "every scope is offered, all checked by default",
  (await page.locator('input[name="ak-scope"]').count()) === 7 &&
    (await page.locator('input[name="ak-scope"]:checked').count()) === 7
);

await page.click("[data-ak-create]");
check(
  "a key needs a name",
  (await page.locator(".ak-secret").count()) === 0 &&
    (await page.locator("#toasts .toast").count()) >= 1
);
await page.fill("#ak-name", "Stats bot");
await page.uncheck('input[name="ak-scope"][value="training"]');
await page.uncheck('input[name="ak-scope"][value="account"]');
await page.press("#ak-name", "Enter"); // Enter makes the key and does not save the settings form
await page.waitForSelector(".ak-secret");
check(
  "Enter makes the key and the settings form is not submitted",
  (await page.locator("#settings-savebar:not([hidden])").count()) === 0 &&
    page.url().endsWith("/settings")
);
const secret = (await page.locator("#ak-secret-text").innerText()).trim();
check("the secret is shown once, with a curl example", /^hok_[A-Za-z0-9_-]{43}$/.test(secret));
check(
  "the example carries the real address",
  (await page.locator(".ak-example").innerText()).includes(`${app.baseUrl}/api/v1/heroes`)
);
await page.click("[data-ak-copy]");
check(
  "the copy button puts the key on the clipboard",
  (await page.evaluate(() => navigator.clipboard.readText())) === secret
);
check(
  "the list shows the key by its hint and its scopes, never the secret",
  (await page.locator(".ak-key").count()) === 1 &&
    (await page.locator(".ak-key code").innerText()).startsWith(secret.slice(0, 10)) &&
    !(await page.locator(".ak-list").innerText()).includes(secret) &&
    (await page.locator(".ak-key__scopes .pill").count()) === 5
);

// ---- the key works, within its scopes ----------------------------------------------------------
const bearer = { authorization: `Bearer ${secret}` };
const call = path => app.browser().get(path, bearer);
check("the key reads the game", (await call("/api/v1/heroes")).status === 200);
check(
  "and is refused what it was not given",
  (await call("/api/v1/me")).status === 403 && (await call("/api/v1/space")).status === 403
);

// ---- it is shown once --------------------------------------------------------------------------
await page.click("[data-ak-dismiss]");
check("dismissing hides the secret", (await page.locator(".ak-secret").count()) === 0);
await page.reload();
await ready(page);
await page.waitForSelector(".ak-key");
check(
  "after a reload the secret is gone for good",
  !(await page.content()).includes(secret) && (await page.locator(".ak-secret").count()) === 0
);

// ---- a hostile name is text, never markup ----------------------------------------------------------
const hostile = `<img src=x onerror="window.__pwned=1"><b>"'&amp;`;
await page.fill("#ak-name", hostile);
await page.click("[data-ak-create]");
await page.waitForSelector(".ak-secret");
await page.waitForTimeout(300);
check(
  "a key named like markup shows its name as text, and nothing runs",
  (await page.evaluate(() => window.__pwned)) === undefined &&
    (await page.locator(".ak-key__name img").count()) === 0 &&
    (await page.locator(".ak-key__name b").filter({ hasText: "onerror" }).count()) === 1
);
const other = await page.locator(".ak-secret code").first().innerText();
await page.click("[data-ak-dismiss]");
await page.reload();
await ready(page);
await page.waitForSelector(".ak-key");
check(
  "and after a reload too",
  (await page.evaluate(() => window.__pwned)) === undefined &&
    (await page.locator(".ak-list img").count()) === 0 &&
    other.startsWith("hok_")
);

// the hostile key goes first (the newest is the first of the list), so that one key is left
page.once("dialog", dialog => dialog.accept());
await page.locator("[data-ak-revoke]").first().click();
await page.waitForSelector("[data-ak-remove]");
await page.locator("[data-ak-remove]").first().click();
await page.waitForFunction(() => document.querySelectorAll(".ak-key").length === 1);

// ---- revoke it ---------------------------------------------------------------------------------
page.once("dialog", dialog => dialog.dismiss());
await page.click("[data-ak-revoke]");
check("revoking asks first: no keeps it", (await call("/api/v1/heroes")).status === 200);
page.once("dialog", dialog => dialog.accept());
await page.click("[data-ak-revoke]");
await page.waitForSelector("[data-ak-remove]");
check("revoking stops the key at once", (await call("/api/v1/heroes")).status === 401);
check(
  "the list keeps it as revoked, then removes it",
  /Revoked/.test(await page.locator(".ak-key").innerText())
);
await page.click("[data-ak-remove]");
await page.waitForSelector(".empty-line");
check("removed: the list is empty again", (await page.locator(".ak-key").count()) === 0);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\napi-keys e2e passed");
