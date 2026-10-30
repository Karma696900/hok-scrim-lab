// The page of a person who is signed in arrives DRAWN: its frame (the title, the introduction and a skeleton: what the
// page shows before its data) is in the HTML, the same for everybody, drawn by the server's own browser from the site's own
// client code (platform/http/prerender.js). The browser's script then fills it with the person's data without replacing
// the title. This checks, for every view that has a frame, for an ordinary person and for an administrator, in both
// themes: the frame is served (private, with the session in the page), it is on the screen with no JavaScript at all and
// styled by the first-paint sheets alone, and the script takes it over (no error, the title is the very same element, the
// skeleton goes away, the page does not jump).
import { chromium } from "playwright";
import { launchChromium } from "../server/features/heroes/sync/hero-sync.js";
import { FRAME_PATHS, VISITOR_FRAME_VIEWS } from "../server/platform/http/page-handler.js";
import { createPrerenderer } from "../server/platform/http/prerender.js";
import { sampleHeroes, startTestServer } from "../testing/test-app.js";

let baseUrl = null;
const prerender = createPrerenderer({ launch: launchChromium, baseUrl: () => baseUrl });
const app = await startTestServer({ seedHeroes: false, prerender });
baseUrl = app.baseUrl;
await app.store.saveHeroes(sampleHeroes(120), "20260925");
const people = [
  ["an ordinary person", await app.signIn("Pat")],
  ["an administrator", await app.signIn("Keeper", { admin: true })]
];

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const cookieOf = who => `hok_session=${who.browser.jar.get("hok_session")}`;
const browser = await chromium.launch();

/** The page as the server sends it. The first request of a view may get the plain shell while its frame is drawn. */
async function served(path, who) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${app.baseUrl}${path}`, { headers: { cookie: cookieOf(who) } });
    const html = await response.text();
    if (/data-ssr="frame"/.test(html)) {
      return { response, html, framed: true };
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return { framed: false };
}

/** A person's browser: the session, a theme, optionally without JavaScript. */
async function open(who, { theme = "dark", javaScript = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    isMobile: true,
    javaScriptEnabled: javaScript,
    reducedMotion: "no-preference"
  });
  await context.addCookies([
    { name: "hok_session", value: who.browser.jar.get("hok_session"), url: app.baseUrl },
    { name: "hok_theme", value: theme, url: app.baseUrl }
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  return { context, page, errors };
}

// node src/client/frames.e2e.mjs settings space: only those views
const only = process.argv.slice(2);
for (const [view, path] of Object.entries(FRAME_PATHS)) {
  if (only.length && !only.includes(view)) {
    continue;
  }
  for (const [kind, who] of people) {
    const label = `${view}, ${kind}`;
    const { response, html, framed } = await served(path, who);
    check(`${label}: the page comes with its frame`, framed);
    if (!framed) {
      continue;
    }
    const boot = JSON.parse(/id="boot">([\s\S]*?)<\/script>/.exec(html)[1]);
    check(
      `${label}: private, with the session of the person in the page and the whole stylesheet on its way`,
      response.headers.get("cache-control") === "private, no-store" &&
        Boolean(boot.b?.me?.user) &&
        Boolean(boot.w) &&
        /<html [^>]*class="ssr-first"/.test(html)
    );

    // Without JavaScript, in each theme: the heading is there, and styled by the sheets of the page alone
    const seen = {};
    for (const theme of ["dark", "light"]) {
      const { context, page } = await open(who, { theme, javaScript: false });
      await page.goto(`${app.baseUrl}${path}`);
      const heading = page.locator("#view h1").first();
      const text = (await heading.textContent())?.trim() ?? "";
      const styled = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        return style.textTransform === "uppercase" && Number(style.fontWeight) >= 600;
      });
      const visible = await heading.isVisible();
      check(
        `${label}, ${theme} theme: the heading "${text.slice(0, 30)}" is on the screen without JavaScript, styled by the first-paint sheets`,
        text.length > 0 && styled && visible
      );
      seen[theme] = text;
      await context.close();
    }
    check(
      `${label}: the frame says the same in both themes`,
      seen.dark === seen.light && seen.dark.length > 0
    );

    // With JavaScript: the script fills the frame; its title is the same element from the first paint to the last
    for (const theme of ["dark", "light"]) {
      const { context, page, errors } = await open(who, { theme });
      await page.addInitScript(() => {
        window.__shift = 0;
        const look = () => {
          const heading = document.querySelector("#view h1");
          if (heading && !window.__frameHeading) {
            window.__frameHeading = heading;
            window.__frameText = heading.textContent.trim();
          }
        };
        new MutationObserver(look).observe(document, { childList: true, subtree: true });
        look();
        try {
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) {
                window.__shift += entry.value;
              }
            }
          }).observe({ type: "layout-shift", buffered: true });
        } catch {
          /* no layout-shift entries in this browser */
        }
      });
      await page.goto(`${app.baseUrl}${path}`);
      await page.waitForSelector("html[data-ready='1']", { timeout: 20000 });
      // the skeleton is gone and nothing moves any more
      await page
        .waitForFunction(
          () => !document.querySelector("#view .loading-line, #view .skeletons"),
          null,
          {
            timeout: 15000
          }
        )
        .catch(() => {});
      await page.waitForTimeout(800);
      const result = await page.evaluate(() => ({
        sameHeading:
          Boolean(window.__frameHeading) &&
          window.__frameHeading.isConnected &&
          document.querySelector("#view h1") === window.__frameHeading,
        text: document.querySelector("#view h1")?.textContent.trim() ?? "",
        first: window.__frameText ?? "",
        waiting: document.querySelectorAll("#view .loading-line, #view .skeletons").length,
        shift: window.__shift,
        frameLeft: document.querySelector("#view")?.dataset.ssr ?? null
      }));
      check(
        `${label}, ${theme} theme: the script takes the frame over (same title element, no skeleton left, no error)`,
        result.sameHeading &&
          result.waiting === 0 &&
          errors.length === 0 &&
          result.text === result.first
      );
      check(
        `${label}, ${theme} theme: the page does not jump while it fills (${result.shift.toFixed(3)})`,
        result.shift < 0.05
      );
      if (errors.length || !result.sameHeading || result.waiting) {
        console.log(`     ${JSON.stringify(result)}`);
      }
      for (const message of errors.slice(0, 3)) {
        console.log(`     ${message.slice(0, 200)}`);
      }
      await context.close();
    }
  }
}

// A visitor who opens a page that waits for what its link carries (a space shared by a link) gets a frame too: the link
// is after the "#", which no server receives, so what the server draws is the page before it is opened
for (const view of VISITOR_FRAME_VIEWS) {
  const path = { "space-shared": "/space/shared" }[view];
  let html = "";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    html = await (await fetch(`${app.baseUrl}${path}`)).text();
    if (/data-ssr="frame"/.test(html)) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  check(`${view}, a visitor: the page comes with its frame`, /data-ssr="frame"/.test(html));
  for (const theme of ["dark", "light"]) {
    const dry = await browser.newContext({
      viewport: { width: 412, height: 823 },
      javaScriptEnabled: false
    });
    await dry.addCookies([{ name: "hok_theme", value: theme, url: app.baseUrl }]);
    const bare = await dry.newPage();
    await bare.goto(`${app.baseUrl}${path}`);
    const heading = bare.locator("#view h1").first();
    check(
      `${view}, a visitor, ${theme} theme: the heading is on the screen without JavaScript, styled by the first-paint sheets`,
      (await heading.isVisible()) &&
        (await heading.evaluate(element => getComputedStyle(element).textTransform === "uppercase"))
    );
    await dry.close();
    // with JavaScript and a link that opens nothing: the page says so, in the same title element, without an error
    const live = await browser.newContext({
      viewport: { width: 412, height: 823 },
      isMobile: true
    });
    await live.addCookies([{ name: "hok_theme", value: theme, url: app.baseUrl }]);
    const tab = await live.newPage();
    const trouble = [];
    tab.on("pageerror", error => trouble.push(error.message));
    await tab.addInitScript(() => {
      const look = () => {
        const heading = document.querySelector("#view h1");
        if (heading && !window.__frameHeading) {
          window.__frameHeading = heading;
        }
      };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
      look();
    });
    await tab.goto(`${app.baseUrl}${path}#not-a-link`);
    await tab.waitForSelector("html[data-ready='1']", { timeout: 20000 });
    await tab
      .waitForFunction(
        () => !document.querySelector("#view .loading-line, #view .skeletons"),
        null,
        {
          timeout: 15000
        }
      )
      .catch(() => {});
    check(
      `${view}, a visitor, ${theme} theme: the script takes the frame over (same title element, no skeleton left, no error)`,
      (await tab.evaluate(
        () =>
          Boolean(window.__frameHeading) &&
          document.querySelector("#view h1") === window.__frameHeading &&
          !document.querySelector("#view .loading-line, #view .skeletons")
      )) && trouble.length === 0
    );
    await live.close();
  }
}

// What an ordinary person sees of a page for administrators is the frame of that page for them (a sentence), not the
// administrators' stage with its figures
{
  const [, person] = people[0];
  const [, staff] = people[1];
  const reports = {
    person: (await served("/reports", person)).html ?? "",
    staff: (await served("/reports", staff)).html ?? ""
  };
  check(
    "reports: an ordinary person's frame says the page is for administrators, an administrator's has the figures",
    /for administrators/i.test(reports.person) && !/for administrators/i.test(reports.staff)
  );
}

// A series whose game is being drafted opens on the ROOM of the draft (the two sides, the clock, empty), drawn by the server
// before the series is asked for; "Live draft" (/live) is the same page. A series with no game being played, a series of
// somebody else and a person with nothing in progress get the ordinary page.
{
  const [, owner] = people[0];
  const [, stranger] = people[1];
  const created = await owner.browser.post("/api/series", {
    teamA: "Alpha",
    teamB: "Orion",
    bestOf: 1,
    gameMode: "global-ban-pick"
  });
  const id = created.body.id;
  const room = async (path, who) => {
    const { html } = await served(path, who);
    return {
      framed: /data-ssr="frame"/.test(html ?? ""),
      room: /series-board[^>]*data-frame/.test(html ?? "") && /id="draft-timer"/.test(html ?? "")
    };
  };
  const waiting = await room(`/scrims/${id}`, owner);
  check("a series with no game started yet has the ordinary page, not the room", !waiting.room);
  await owner.browser.post(`/api/series/${id}/game`, { blueTeam: "Alpha" });
  const opened = await room(`/scrims/${id}`, owner);
  check(
    "a series whose game is being drafted comes with the room, drawn",
    opened.framed && opened.room
  );
  const live = await room("/live", owner);
  check(
    "Live draft comes with the room too (the first series in progress)",
    live.framed && live.room
  );
  const notYours = await room(`/scrims/${id}`, stranger);
  check("the series of somebody else is not drawn (it is not theirs to see)", !notYours.room);

  // the room is on the screen with no JavaScript, and the script fills it (the clock is the same element, no error, no jump)
  const dry = await open(owner, { javaScript: false });
  await dry.page.goto(`${app.baseUrl}/scrims/${id}`);
  const timer = dry.page.locator("#draft-timer");
  check(
    "the room is on the screen without JavaScript, the clock in big digits",
    (await timer.isVisible()) &&
      (await timer.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 40))
  );
  await dry.context.close();
  for (const path of [`/scrims/${id}`, "/live"]) {
    const { context, page, errors } = await open(owner);
    await page.addInitScript(() => {
      window.__shift = 0;
      const look = () => {
        const timerNode = document.querySelector("#draft-timer");
        if (timerNode && !window.__timer) {
          window.__timer = timerNode;
        }
      };
      new MutationObserver(look).observe(document, { childList: true, subtree: true });
      look();
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__shift += entry.hadRecentInput ? 0 : entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${app.baseUrl}${path}`);
    await page.waitForSelector("html[data-ready='1']", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector(".dr-pool .hero-card"), null, {
      timeout: 15000
    });
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => ({
      same: Boolean(window.__timer) && document.querySelector("#draft-timer") === window.__timer,
      frameLeft: Boolean(document.querySelector(".series-board[data-frame]")),
      inert: document.querySelector(".series-board")?.inert ?? null,
      cards: document.querySelectorAll(".dr-pool .hero-card").length,
      shift: window.__shift
    }));
    check(
      `${path === "/live" ? "Live draft" : "the series"}: the script takes the room over (the clock is the same element, usable, the pool is there, no error)`,
      result.same &&
        !result.frameLeft &&
        result.inert === false &&
        result.cards > 0 &&
        errors.length === 0
    );
    check(
      `${path === "/live" ? "Live draft" : "the series"}: the page does not jump while it fills (${result.shift.toFixed(3)})`,
      result.shift < 0.05
    );
    for (const message of errors.slice(0, 3)) {
      console.log(`     ${message.slice(0, 200)}`);
    }
    await context.close();
  }
}

await browser.close();
await prerender.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nframes e2e passed");
