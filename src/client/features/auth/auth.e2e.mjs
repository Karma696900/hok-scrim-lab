// Browser journey of the account pages: register -> QR/setup -> recovery codes -> signed in -> sign
// out -> sign in with password + authenticator code -> recovery code -> account page -> password
// change; real URLs and history.
import { chromium } from "playwright";
import { hotp, stepAt } from "../../../server/platform/security/totp.js";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";
import { textOf } from "../../../testing/text.js";

const app = await startTestServer();
const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("console", message => {
  if (message.text().includes("status of 40")) {
    return;
  }
  if (["error", "warning"].includes(message.type())) {
    problems.push(`console.${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
await page.route("https://camp.honorofkings.com/**", route =>
  route.fulfill({ status: 200, contentType: "image/png", body: pixel })
);
const path = () => new URL(page.url()).pathname;
const email = `journey${Date.now()}@example.test`;
const password = "a long winding passphrase 7";

// Real URLs and history
await page.goto(`${app.baseUrl}/heroes`);
await page.waitForSelector("#view h1");
check(
  "a deep link opens its page (/heroes)",
  /Hero index/i.test(await page.locator("h1").innerText())
);
await goNav(page, '.nav-link[data-view="scrims"]');
await page.waitForSelector("#view h1");
check("navigation changes the URL without reloading (/scrims)", path() === "/scrims");
await page.goBack();
await page.waitForFunction(
  () =>
    location.pathname === "/heroes" &&
    /Hero index/i.test(document.querySelector("h1")?.innerText ?? "")
);
check("the back button restores the previous page", true);
check("the document title follows the page", /heroes/i.test(await page.title()));
await page.goto(`${app.baseUrl}/does-not-exist`);
await page.waitForSelector(".lost h1");
check(
  "an unknown URL shows the 404 page",
  /page not found/i.test(await page.locator("h1").innerText())
);

// Register
await page.goto(`${app.baseUrl}/`);
await page.click('#account-control a[href="/register"]');
await page.waitForSelector('form[data-auth-form="register"]');
check("'Create account' opens the register page", path() === "/register");
// The page covers the whole screen: the Tab key stays on it and never goes to the bars hidden under it.
{
  await page.focus("#name");
  const stops = [];
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => Boolean(document.activeElement?.closest(".topbar, .tabbar")))
    );
  }
  check("on the register page the Tab key never goes to the bars under it", !stops.includes(true));
}
await page.fill("#name", "Journey");
await page.fill("#email", email);
await page.fill("#password", "short");
await page.fill("#confirm", "short");
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /at least 12/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
check("a weak password is explained", true);
await page.fill("#password", password);
await page.fill("#confirm", `${password}x`);
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /different/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
check("mismatching passwords are caught before sending", true);
await page.fill("#confirm", password);
await page.click('button[type="submit"]');
await page.waitForSelector("img.qr");
check(
  "after registering, the QR setup page is shown",
  path() === "/login/setup" &&
    (await page.locator("img.qr").getAttribute("src")).startsWith("data:image/svg+xml")
);
check(
  "the QR has an accessible description and a manual key",
  /QR code/.test(await page.locator("img.qr").getAttribute("alt")) &&
    (await page.locator("#setup-key").innerText()).replace(/\s/g, "").length === 32
);
const secret = (await page.locator("#setup-key").innerText()).replace(/\s/g, "");
check(
  "no session yet: the header still offers Sign in",
  (await page.locator('#account-control a[href^="/login"]').count()) === 1
);
await page.fill("#code", "000000");
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /not valid/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
check("a wrong code is refused", true);
await page.fill("#code", hotp(secret, stepAt()));
await page.click('button[type="submit"]');
await page.waitForSelector(".recovery-codes");
const codes = await page.locator(".recovery-codes code").allInnerTexts();
check(
  "ten recovery codes are shown once",
  codes.length === 10 && codes.every(code => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code))
);
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /confirm that you saved/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
check("continuing requires confirming the codes were saved", true);
await page.check("#saved");
await Promise.all([page.waitForURL(`${app.baseUrl}/`), page.click('button[type="submit"]')]);
// a new account is offered the welcome pages, which cover the whole screen (the bar under them is out of reach): skipping
// them lands on the home page, where the header shows the account
await page.waitForURL(/\/welcome$/);
await page.waitForSelector(".onboarding");
await page.click("[data-skip]");
await page.waitForURL(`${app.baseUrl}/`);
await page.waitForSelector("#account-trigger");
check(
  "signed in: the header shows the account and Sign out",
  /Journey/.test(await textOf(page, "#account-control")) // textContent: the name is drawn in capitals by the style
);
await page.goto(`${app.baseUrl}/login`);
// away from /login, wherever it goes: the address "/" may last only a moment
await page.waitForFunction(() => location.pathname !== "/login");
check("a signed-in user is sent away from the login page", true);

// Sign out and in again
await page.click("#account-trigger");
await page.click('.pop--account [data-pick="logout"]');
await page.waitForSelector('#account-control a[href^="/login"]');
await page.goto(`${app.baseUrl}/login?next=%2Fheroes`);
await page.waitForSelector('form[data-auth-form="login"]');
await page.fill("#email", email);
await page.fill("#password", `${password}-wrong`);
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /invalid email or password/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
check("a wrong password gives the generic message", true);
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForSelector('form[data-auth-form="mfa"]');
check(
  "the code page follows, keeping the destination",
  path() === "/login/mfa" && page.url().includes("next=%2Fheroes")
);
check(
  "the code field is set up for one-time-code autofill",
  (await page.getAttribute("#code", "autocomplete")) === "one-time-code" &&
    (await page.getAttribute("#code", "inputmode")) === "numeric"
);
await page.fill("#code", "123456");
await page.click('button[type="submit"]');
await page.waitForFunction(() =>
  /not valid/i.test(document.querySelector("#auth-error")?.textContent ?? "")
);
await page.click('[data-auth-action="toggle-recovery"]');
await page.waitForSelector("#recoveryCode");
await page.fill("#recoveryCode", codes[0]);
await Promise.all([page.waitForURL(`${app.baseUrl}/heroes`), page.click('button[type="submit"]')]);
check("a recovery code signs in and lands on the requested page", true);

// Account page (the welcome pages were skipped right after the registration)
await page.waitForSelector("#account-trigger");
await page.click("#account-trigger");
await page.click('.pop--account a[href="/account"]');
await page.waitForSelector("h1:has-text('Security')");
check(
  "the account page shows MFA on and the codes left",
  /On/.test(await textOf(page, ".account-stats")) && /9/.test(await textOf(page, ".account-stats"))
);
check(
  "the recent activity lists the sign-ins",
  /signed in/i.test(await page.locator(".auth-table").innerText())
);
check(
  "the table has real headers (accessibility)",
  (await page.locator('.auth-table th[scope="col"]').count()) === 3
);
const newPassword = "an even better passphrase 88";
await page.fill("#currentPassword", password);
await page.fill("#newPassword", newPassword);
await page.fill('form[data-auth-form="password"] #code', hotp(secret, stepAt() + 1));
await page.click('form[data-auth-form="password"] button[type="submit"]');
await page.waitForFunction(() =>
  /Password changed/.test(document.querySelector("#toasts")?.textContent ?? "")
);
check("the password can be changed with a fresh authenticator code", true);

// The rights over one's data: a copy, then the erasure (each asks for the authenticator code)
// the page draws again after the password change: the old block may still be there for a moment, so wait for the new one
await page
  .waitForFunction(
    () =>
      document.querySelectorAll('form[data-auth-form="export"]').length === 1 &&
      document.querySelectorAll('form[data-auth-form="delete"]').length === 1,
    null,
    { polling: 100, timeout: 8000 }
  )
  .catch(() => {});
await page.waitForTimeout(600);
check(
  "the account page has the block of the data, with a copy and an erasure",
  (await page.locator('form[data-auth-form="export"]').count()) === 1 &&
    (await page.locator('form[data-auth-form="delete"]').count()) === 1
);
const timeMoves = () =>
  app.store.pool.query("UPDATE users SET mfa_last_step = mfa_last_step - 3 WHERE login_email = ?", [
    email
  ]);
await timeMoves();
await page.fill('form[data-auth-form="export"] input[name="code"]', hotp(secret, stepAt() + 1));
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click('form[data-auth-form="export"] button[type="submit"]')
]);
check(
  "the copy of the data downloads as a JSON file",
  /^hok-my-data-.*\.json$/.test(download.suggestedFilename())
);
await timeMoves();
await page.fill('form[data-auth-form="delete"] input[name="password"]', newPassword);
await page.fill('form[data-auth-form="delete"] input[name="code"]', hotp(secret, stepAt() + 1));
await page.click('form[data-auth-form="delete"] button[type="submit"]');
check(
  "erasing without ticking the box is refused on the page",
  (await page.locator('form[data-auth-form="delete"] .form-error').innerText()).length > 0 &&
    (await page.locator("#account-trigger").count()) === 1
);

// Security
await page.click('[data-auth-action="logout-all"]');
await page.waitForURL(`${app.baseUrl}/login`);
check("sign out everywhere ends the session", true);
await page.goto(`${app.baseUrl}/account`);
await page.waitForFunction(() => location.pathname === "/login");
check("the account page asks to sign in first", page.url().includes("next=%2Faccount"));

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\nauth e2e clean");
process.exit(problems.length ? 1 : 0);
