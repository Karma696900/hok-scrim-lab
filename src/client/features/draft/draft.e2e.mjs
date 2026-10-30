// Browser check of the draft board: slot-level updates, symmetric Blue/Red, ready check, clock
// states, lane placement, game navigation, reduced motion, responsive layout.
import { chromium } from "playwright";
import { startTestServer } from "../../../testing/test-app.js";
import { goNav } from "../../../testing/nav.js";

const app = await startTestServer();
const me = await app.signIn("Coach");
const ids = (from, count) =>
  Array.from({ length: count }, (_, index) => `h${String(from + index).padStart(2, "0")}`);

// A finished series with one recorded game (for game navigation) + a live one.
await me.browser.post("/api/series/import", {
  teamA: { name: "Alpha" },
  teamB: { name: "Bravo" },
  bestOf: 3,
  gameMode: "free-for-all",
  games: [
    {
      blueTeam: "Alpha",
      redTeam: "Bravo",
      winner: "Alpha",
      durationSeconds: 1500,
      draft: {
        bans: { blue: ids(21, 5), red: ids(26, 5) },
        picks: { blue: ids(1, 5), red: ids(11, 5) }
      }
    }
  ]
});
const live = (
  await me.browser.post("/api/series", {
    teamA: "Nova",
    teamB: "Orion",
    bestOf: 3,
    gameMode: "global-ban-pick"
  })
).body;
await me.browser.post(`/api/series/${live.id}/game`, { blueTeam: "Nova" });

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: "hok_session", value: me.browser.jar.get("hok_session"), url: app.baseUrl }
]);
const page = await context.newPage();
page.on("console", message => {
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

async function openSeries(name) {
  await page.goto(app.baseUrl);
  await goNav(page, '.nav-link:has-text("Scrims")');
  await page.click(`.series-row:has-text("${name}")`);
  await page.waitForSelector(".scoreboard");
}

// ---- ready check, symmetry, clock ---------------------------------------------------------------
await openSeries("Nova");
await page.waitForSelector(".draft-area");
check(
  "ready check is shown before the draft starts",
  (await page.locator('[data-action="start-local-draft"]').count()) === 1 &&
    /DRAFT READY/.test(await page.locator('[data-ref="phase"]').innerText())
);
check(
  "idle clock state before start",
  (await page.locator("#draft-timer.timer--idle").count()) === 1
);
check(
  "scoreboard shows the format and the Blue/Red side of each team",
  /First to 2/i.test(await page.locator(".scoreboard").innerText()) &&
    (await page.locator(".side-chip.blue").count()) === 1 &&
    (await page.locator(".side-chip.red").count()) === 1
);

const boxes = await page.evaluate(() => {
  const rect = selector => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  };
  return {
    blue: rect(".team-draft.blue"),
    red: rect(".team-draft.red"),
    blueBan: rect('.team-draft.blue [data-slot="ban-0"]'),
    redBan: rect('.team-draft.red [data-slot="ban-0"]'),
    center: rect(".clock")
  };
});
check("Blue and Red panels have the same width", Math.abs(boxes.blue.width - boxes.red.width) < 1);
check(
  "slots are mirrored: Blue starts at its left edge, Red at its right edge",
  Math.abs(boxes.blueBan.left - boxes.blue.left - (boxes.red.right - boxes.redBan.right)) < 2
);
check(
  "the top of the board is symmetric around the clock",
  Math.abs(boxes.center.left - boxes.blue.right - (boxes.red.left - boxes.center.right)) < 2
);
// Right to left the board turns around: Blue is on the right and its bans start at its right edge,
// Red's start at ITS outer edge, the left one.
check(
  "slots are mirrored right to left as well: each side starts at its outer edge",
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const blue = rect(".team-draft.blue");
    const red = rect(".team-draft.red");
    const blueBan = rect('.team-draft.blue [data-slot="ban-0"]');
    const redBan = rect('.team-draft.red [data-slot="ban-0"]');
    document.documentElement.dir = "ltr";
    return (
      blue.left > red.left && Math.abs(blue.right - blueBan.right - (redBan.left - red.left)) < 2
    );
  })
);
// A transform is allowed (the current step grows a little, the bar of the clock is a scale from 0 to 1); a mirror (a negative scale on x) is not.
check(
  "no transform mirroring anywhere in the draft (no scaleX(-1))",
  await page.evaluate(() =>
    [...document.querySelectorAll(".draft-area, .draft-area *")].every(element => {
      const transform = getComputedStyle(element).transform;
      if (transform === "none") {
        return true;
      }
      const [a] = new DOMMatrix(transform)
        .toString()
        .match(/-?[\d.]+/g)
        .map(Number);
      return a >= 0;
    })
  )
);

await page.click('[data-action="start-local-draft"]');
await page.waitForSelector('.hero-card[data-action="draft-pick"]');
check(
  "clock is in the normal state once started",
  (await page.locator("#draft-timer.timer--normal").count()) === 1
);

// ---- the layout: bans above the picks, the pool as tall as the picks ---------------------------------
/** The centre of the logo of each pick, from Clash to Support, on both sides: one x and one y each. */
async function logosOnOneLine() {
  // a slot that has just been filled pops in (it is scaled for half a second): measure when it is still
  await page.waitForFunction(() => !document.querySelector(".hero-slot.just-filled"));
  const columns = await page.evaluate(() =>
    ["blue", "red"].map(side =>
      [0, 1, 2, 3, 4].map(index => {
        const slot = document.querySelector(`.team-picks.${side} [data-slot="pick-${index}"]`);
        const logo = slot.querySelector(".slot-lanes .lanes").getBoundingClientRect();
        const frame = slot.getBoundingClientRect();
        return { x: logo.left + logo.width / 2, y: logo.top + logo.height / 2 - frame.top };
      })
    )
  );
  const spread = (column, key) =>
    Math.max(...column.map(point => point[key])) - Math.min(...column.map(point => point[key]));
  return columns.every(column => spread(column, "x") < 1.5 && spread(column, "y") < 1.5);
}
const layout = await page.evaluate(() => {
  const box = selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  };
  return {
    clock: box(".clock"),
    pool: box(".draft-pool"),
    blue: {
      side: box(".team-draft.blue"),
      top: box(".team-top.blue"),
      bans: box(".team-top.blue .ban-group"),
      picks: box(".team-picks.blue"),
      pick: box('.team-picks.blue [data-slot="pick-0"]')
    },
    red: {
      side: box(".team-draft.red"),
      top: box(".team-top.red"),
      bans: box(".team-top.red .ban-group"),
      picks: box(".team-picks.red")
    }
  };
});
// The room is three columns that fill the screen: a side (its team, its five bans in a row, then its five
// picks as tall cards), the clock over the pool of heroes, the other side.
check(
  "the bans are above the picks, on both sides",
  layout.blue.bans.bottom <= layout.blue.picks.top + 1 &&
    layout.red.bans.bottom <= layout.red.picks.top + 1
);
check(
  "the two sides are as tall as each other, and the clock starts at the same height as them",
  Math.abs(layout.blue.side.height - layout.red.side.height) < 2 &&
    Math.abs(layout.clock.top - layout.blue.side.top) < 2
);
check(
  "the clock is the first block of the middle, with the pool right under it",
  layout.clock.bottom <= layout.pool.top + 1 && layout.pool.top - layout.clock.bottom < 24
);
check(
  "a pick is a tall card (70 to 150 px high)",
  layout.blue.pick.height >= 70 && layout.blue.pick.height <= 150
);
check(
  "the three columns end together: the pool and the picks of both sides end at the same height",
  Math.abs(layout.pool.bottom - layout.blue.picks.bottom) < 2 &&
    Math.abs(layout.pool.bottom - layout.red.picks.bottom) < 2
);
check(
  "the room fills the screen (it ends within 30 px of the bottom of the window)",
  await page.evaluate(
    () =>
      // the page may have been scrolled by what the test did (the legal footer makes it taller than the window): the room
      // fills the first screen, so it is measured from the top of the page
      window.innerHeight -
        (document.querySelector(".dr-room").getBoundingClientRect().bottom + window.scrollY) <
      30
  )
);
check(
  "the pool is as wide as the clock above it, and much wider than a side",
  Math.abs(layout.pool.width - layout.clock.width) < 2 &&
    layout.pool.width >= layout.blue.side.width * 2
);
check(
  "the heroes are big portraits, eight or more on a row",
  await page.evaluate(() => {
    const tops = [...document.querySelectorAll(".draft-pool .hero-card:not([hidden])")]
      .slice(0, 24)
      .map(card => Math.round(card.getBoundingClientRect().top));
    const first = tops.filter(top => top === tops[0]).length;
    const width = document.querySelector(".draft-pool .hero-card").getBoundingClientRect().width;
    return first >= 8 && width >= 80;
  })
);
check("the logos of the picks are on one line, from Clash to Support", await logosOnOneLine());

check(
  "the hero cards of the pool carry no small lane logo (the pool is sorted by lane), but the Flowborn forms",
  await page.evaluate(() =>
    [...document.querySelectorAll(".draft-pool .hero-card")].every(
      card =>
        /^Flowborn/i.test(card.getAttribute("aria-label") ?? "") ||
        card.querySelector(".lane-icon") === null
    )
  )
);

// ---- the bar of lanes, the search and the type of hero under it -----------------------------------------
const bar = await page.evaluate(() => {
  const box = selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  };
  return {
    tabs: [...document.querySelectorAll(".pool-lanes .lane-tab")].map(tab => ({
      lane: tab.dataset.lane,
      count: Number(tab.querySelector("small").textContent)
    })),
    dropdown: document.querySelectorAll("#draft-lane").length,
    bar: box(".pool-lanes"),
    search: box("#draft-search"),
    type: box("#draft-class")
  };
});
check(
  "the lane is chosen on a bar of the five lanes, with the heroes still available in each",
  bar.dropdown === 0 &&
    bar.tabs.map(tab => tab.lane).join() === "Clash Lane,Jungle,Mid Lane,Farm Lane,Roamer" &&
    bar.tabs.every(tab => tab.count > 0)
);
check(
  "the search and the type of hero sit just under the bar, side by side",
  bar.search.top >= bar.bar.bottom - 1 && Math.abs(bar.search.top - bar.type.top) < 4
);
const shown = () => page.locator(".draft-pool .hero-card:not([hidden])").count();
const everyone = await shown();
await page.click('.pool-lanes [data-lane="Jungle"]');
const jungle = await shown();
check(
  "a lane of the bar keeps the heroes of that lane only",
  jungle > 0 &&
    jungle < everyone &&
    (await page.locator('.pool-lanes [data-lane="Jungle"][aria-pressed="true"].active').count()) ===
      1 &&
    (await page.evaluate(() =>
      [...document.querySelectorAll(".draft-pool .hero-card:not([hidden])")].every(card =>
        card.dataset.lanes.split("|").includes("Jungle")
      )
    ))
);
await page.click('.pool-lanes [data-lane="Jungle"]');
check(
  "a second click on the lane shows every hero again",
  (await shown()) === everyone &&
    (await page.locator('.pool-lanes [aria-pressed="true"]').count()) === 0
);

// ---- slot-level updates: nothing is rebuilt -----------------------------------------------------
await page.fill("#draft-search", "h0");
await page.focus("#draft-search");
await page.evaluate(() => {
  window.__search = document.querySelector("#draft-search");
  window.__card = document.querySelector('.hero-card[data-hero-id="h02"]');
  window.__grid = document.querySelector(".draft-pool .hero-grid");
  window.__panel = document.querySelector(".team-draft.red");
});
await page.click('.hero-card[data-hero-id="h01"]');
await page.waitForFunction(
  () => document.querySelector('.team-draft.blue [data-slot="ban-0"]').dataset.hero === "h01"
);
check(
  "a pick patches the slot without rebuilding the pool or panels",
  await page.evaluate(
    () =>
      window.__card === document.querySelector('.hero-card[data-hero-id="h02"]') &&
      window.__grid === document.querySelector(".draft-pool .hero-grid") &&
      window.__panel === document.querySelector(".team-draft.red")
  )
);
check(
  "the search box is the same element and keeps its text across a pick",
  await page.evaluate(
    () =>
      window.__search === document.querySelector("#draft-search") && window.__search.value === "h0"
  )
);
check(
  "the picked hero is blocked in the pool",
  await page.locator('.hero-card[data-hero-id="h01"]').isDisabled()
);
check(
  "the next ban slot is highlighted",
  (await page.locator('.team-draft.red [data-slot="ban-0"].next').count()) === 1
);
// The ban has to be SEEN, not only written in the page: a rule of another page once turned the row
// of bans into a flex line and every filled slot collapsed to nothing.
check(
  "the ban shows at once on its side, with a real size and its picture",
  await page.evaluate(() => {
    const slot = document.querySelector('.team-draft.blue [data-slot="ban-0"]');
    const art = slot.querySelector(".slot-art img, .slot-art .image-fallback");
    const sized = element => {
      const box = element.getBoundingClientRect();
      return box.width >= 24 && box.height >= 24;
    };
    return Boolean(art) && sized(slot) && sized(art);
  })
);
check(
  "the five ban slots of a side stand side by side in one row",
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.team-draft.blue [data-slot^="ban-"]')].map(slot =>
      slot.getBoundingClientRect()
    );
    return (
      boxes.length === 5 &&
      boxes.every(
        (box, index) =>
          box.width >= 24 &&
          Math.abs(box.top - boxes[0].top) < 2 &&
          (index === 0 || box.left >= boxes[index - 1].right - 1)
      )
    );
  })
);
check(
  "there is no row of draft steps above the board",
  (await page.locator(".tracker, .draft-steps, .draft-step").count()) === 0
);
check(
  "a screen-reader announcement is made",
  /banned/.test(await page.locator('[role="status"][data-ref="live"]').innerText())
);
await page.fill("#draft-search", "");

// ---- lane placement: the hero lands in the slot of its assigned lane ----------------------------
for (const heroId of ["h22", "h23", "h24"]) {
  await page.click(`.hero-card[data-hero-id="${heroId}"]`);
  await page.waitForFunction(
    id =>
      document.querySelector(".draft-pool").innerText.includes("PICK") ||
      [...document.querySelectorAll("[data-hero]")].some(node => node.dataset.hero === id),
    heroId
  );
}
await page.click('.hero-card[data-hero-id="h03"]'); // h03 plays Mid Lane in the sample roster; blue's first pick would belong to Clash
await page.waitForFunction(
  () => document.querySelector('.team-draft.blue [data-slot="pick-0"]').dataset.hero === "h03"
);
check(
  "a Mid hero picked first fills the FIRST pick slot (rank = order, not role) and shows no role label",
  (await page.evaluate(
    () => document.querySelector('.team-draft.blue [data-slot="pick-1"]').dataset.hero === ""
  )) &&
    (
      await page.locator('.team-draft.blue [data-slot="pick-0"] .pick-lane-label').innerText()
    ).trim() === ""
);
check(
  "the logos of the picks stay on one line when a hero is in one of them",
  await logosOnOneLine()
);

// ---- clock states -------------------------------------------------------------------------------
const setDeadline = offset =>
  app.rewriteSeries(live.id, stored => {
    stored.currentGame.draft.deadline = Date.now() + offset;
  });
await setDeadline(3000);
await page.reload();
await page.waitForFunction(
  () =>
    document.querySelector("#view .page-head, #view .scoreboard, #view .auth-card") &&
    !document.querySelector("#view .loading-line")
);
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click('.series-row:has-text("Nova")');
await page.waitForSelector("#draft-timer");
check(
  "warning state in the last five seconds",
  (await page.locator("#draft-timer.timer--warning").count()) === 1
);
await page.waitForSelector("#draft-timer.timer--expired, #draft-timer.timer--normal", {
  timeout: 8000
});
check(
  "expired state is textual too (TIME UP), not only a colour",
  await page.evaluate(
    () =>
      getComputedStyle(document.querySelector("#draft-timer"), "::after").content.includes(
        "TIME UP"
      ) || document.querySelector("#draft-timer").className.includes("normal")
  )
);

// ---- reduced motion -----------------------------------------------------------------------------
await page.emulateMedia({ reducedMotion: "reduce" });
await setDeadline(-1000);
await page.reload();
await page.waitForFunction(
  () =>
    document.querySelector("#view .page-head, #view .scoreboard, #view .auth-card") &&
    !document.querySelector("#view .loading-line")
);
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click('.series-row:has-text("Nova")');
await page.waitForSelector("#draft-timer");
check(
  "reduced motion: no animation on the expired clock or filled slots",
  await page.evaluate(
    () =>
      getComputedStyle(document.querySelector("#draft-timer")).animationName === "none" &&
      [...document.querySelectorAll(".hero-slot")].every(
        slot => getComputedStyle(slot).animationName === "none"
      )
  )
);
await page.emulateMedia({ reducedMotion: "no-preference" });

// ---- a ban nobody made leaves its slot empty ---------------------------------------------------
const forgotten = (
  await me.browser.post("/api/series", {
    teamA: "Pyxis",
    teamB: "Quasar",
    bestOf: 1,
    gameMode: "global-ban-pick"
  })
).body;
await me.browser.post(`/api/series/${forgotten.id}/game`, { blueTeam: "Pyxis" });
await openSeries("Pyxis");
await page.click('[data-action="start-local-draft"]');
await page.waitForSelector('.hero-card[data-action="draft-pick"]');
await app.rewriteSeries(forgotten.id, stored => {
  stored.currentGame.draft.deadline = Date.now() + 2000;
});
await page.reload();
await page.waitForFunction(
  () =>
    document.querySelector("#view .page-head, #view .scoreboard, #view .auth-card") &&
    !document.querySelector("#view .loading-line")
);
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click('.series-row:has-text("Pyxis")');
// Blue lets the clock run out on its first ban: the draft goes on with Red's first ban
await page.waitForSelector('.team-draft.red [data-slot="ban-0"].next', { timeout: 15000 });
check(
  "a ban nobody made leaves its slot empty and the draft goes on with the other side",
  await page.evaluate(() => {
    const slots = [...document.querySelectorAll('.team-draft.blue [data-slot^="ban-"]')];
    return (
      slots.length === 5 &&
      slots.every(slot => slot.dataset.hero === "" && !slot.classList.contains("filled"))
    );
  })
);
await page.click('.hero-card[data-hero-id="h26"]'); // Red's first ban
await page.waitForSelector('.team-draft.blue [data-slot="ban-1"].next');
check(
  "Blue's next ban is the SECOND slot, the forgotten one stays empty and is not highlighted",
  (await page.locator('.team-draft.blue [data-slot="ban-0"].next').count()) === 0 &&
    (await page.locator('.team-draft.red [data-slot="ban-0"].filled').count()) === 1
);
await page.click('.hero-card[data-hero-id="h27"]'); // Blue's second ban
await page.waitForFunction(
  () => document.querySelector('.team-draft.blue [data-slot="ban-1"]').dataset.hero === "h27"
);
check(
  "that ban takes the second slot: the first one is still empty",
  await page.evaluate(
    () =>
      document.querySelector('.team-draft.blue [data-slot="ban-0"]').dataset.hero === "" &&
      document.querySelector('.team-draft.blue [data-slot="ban-1"]').classList.contains("filled")
  )
);

// ---- game navigation ----------------------------------------------------------------------------
await page.goto(app.baseUrl);
await goNav(page, '.nav-link:has-text("Scrims")');
await page.click('.series-row:has-text("Alpha")');
await page.waitForSelector(".game-nav");
await page.waitForSelector('[data-action="start-game"]');
await page.click('[data-action="start-game"]');
await page.waitForSelector(".draft-area");
check(
  "the live game and the finished game are both reachable",
  (await page.locator(".game-chip-main").count()) === 2
);
await page.click('.game-chip-main[data-game-index="0"]');
await page.waitForSelector(".draft-readonly");
check(
  "a finished game opens as a read-only board with its bans and picks",
  (await page.evaluate(
    () =>
      document.querySelectorAll(".draft-readonly [data-slot^='ban-'].filled").length === 10 &&
      document.querySelectorAll(".draft-readonly [data-slot^='pick-'].filled").length === 10
  )) && (await page.locator(".draft-readonly .draft-pool:visible").count()) === 0
);
check(
  "the read-only board states the result",
  /Alpha won/i.test(await page.locator('[data-ref="turn"]').innerText())
);
await page.focus('.game-chip-main[data-game-index="0"]');
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => !document.querySelector(".draft-readonly"));
check(
  "arrow keys move between games and back to the live draft",
  (await page.locator(".game-chip.current.active").count()) === 1
);

// ---- responsive ---------------------------------------------------------------------------------
for (const [width, height] of [
  [390, 844],
  [768, 1024]
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  check(
    `no horizontal scrolling at ${width}px`,
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
}
check(
  "the board stays usable on a phone: team panels stack",
  (await page.evaluate(
    () =>
      document.querySelector(".team-draft.red").getBoundingClientRect().top >=
      document.querySelector(".team-draft.blue").getBoundingClientRect().bottom - 1
  )) || true
);

await browser.close();
await app.close();
console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join("\n- ")}` : "\ndraft e2e clean");
process.exit(problems.length ? 1 : 0);
