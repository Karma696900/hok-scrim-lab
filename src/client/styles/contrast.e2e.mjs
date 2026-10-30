// The contrast of the text, page by page: every piece of text of every page of the demonstration world (visitor,
// captain, administrator), in the dark and in the light theme, must reach WCAG AA (4.5:1, or 3:1 for large text).
// src/client/design.test.js proves the colours of the palette; this proves the pages, where a colour lands on
// the tinted card of a team, on a gradient, on a chip that is switched on. The colour of the text (with its alpha and
// the opacity of its ancestors) is laid over the backgrounds under it (every colour stop of every gradient layer is
// taken as if it covered the whole box: the worst case); text over a picture is counted apart, not judged.
// The same tour also holds two things of the same kind, which a page can get wrong without any rule of the palette
// being broken: the headings go down one level at a time, and the lane logos sit inside their chips (a rule meant for
// the picture of a card once stretched them over it and piled the logos of a hero with two lanes on one another).
import { chromium } from "playwright";
import { demoPages, seedDemoWorld } from "../../../scripts/dev/demo-data.mjs";
import { LANES, sampleHeroes, startTestServer } from "../../testing/test-app.js";

/** Runs in the page. */
function audit() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = value => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, under) => {
    const alpha = top[3] + under[3] * (1 - top[3]);
    if (alpha === 0) {
      return [0, 0, 0, 0];
    }
    return [0, 1, 2]
      .map(i => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / alpha)
      .concat(alpha);
  };
  const channel = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const path = element => {
    const parts = [];
    for (
      let node = element;
      node && node.nodeType === 1 && parts.length < 4;
      node = node.parentElement
    ) {
      const cls =
        typeof node.className === "string"
          ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".")
          : "";
      parts.unshift(node.localName + (node.id ? `#${node.id}` : "") + (cls ? `.${cls}` : ""));
    }
    return parts.join(" > ");
  };
  const colorsIn = value =>
    (value.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8}/g) ?? []).map(rgba);
  /** The top-level layers of a background-image value (they are separated by commas outside parentheses). */
  const layersOf = value => {
    const layers = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") {
        depth += 1;
      } else if (value[i] === ")") {
        depth -= 1;
      } else if (value[i] === "," && depth === 0) {
        layers.push(value.slice(from, i));
        from = i + 1;
      }
    }
    layers.push(value.slice(from));
    return layers.map(layer => layer.trim()).filter(layer => layer && layer !== "none");
  };
  /**
   * The opaque colours the text of this element may sit on: what is under the element, then its own colour, then
   * each gradient layer from the bottom one up, every colour stop being taken as if it covered the whole box (the
   * worst case). Null over a picture.
   */
  const backgroundsOf = element => {
    if (!element || element.nodeType !== 1) {
      return [[0, 0, 0, 1]];
    }
    const s = getComputedStyle(element);
    if (/url\(/.test(s.backgroundImage)) {
      return null;
    }
    const own = rgba(s.backgroundColor);
    const layers = layersOf(s.backgroundImage);
    if (!layers.length && own[3] === 0) {
      return backgroundsOf(element.parentElement);
    }
    let bases = own[3] >= 0.999 ? [own] : backgroundsOf(element.parentElement);
    if (!bases) {
      return null;
    }
    if (own[3] > 0 && own[3] < 0.999) {
      bases = bases.map(base => over(own, base));
    }
    for (const layer of layers.reverse()) {
      const stops = colorsIn(layer);
      if (!stops.length) {
        continue;
      }
      const next = [];
      for (const stop of stops) {
        for (const base of bases) {
          next.push(stop[3] >= 0.999 ? stop : over(stop, base));
        }
      }
      const seenColors = new Set();
      bases = next
        .filter(color => {
          const key = color.map(Math.round).join(",");
          return seenColors.has(key) ? false : seenColors.add(key);
        })
        .slice(0, 40);
    }
    return bases;
  };
  const pictures = [];
  for (const node of document.querySelectorAll("*")) {
    const s = getComputedStyle(node);
    if (s.visibility !== "visible" || Number(s.opacity) < 0.05) {
      continue;
    }
    const isPicture =
      ["IMG", "VIDEO", "CANVAS"].includes(node.tagName) || /url\(/.test(s.backgroundImage);
    if (!isPicture) {
      continue;
    }
    const b = node.getBoundingClientRect();
    if (b.width >= 40 && b.height >= 40) {
      pictures.push(b);
    }
  }
  const overPicture = box => {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    return pictures.some(p => x >= p.left && x <= p.right && y >= p.top && y <= p.bottom);
  };
  const result = { checked: 0, unknown: 0, bad: [] };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (!text || (/^[\s\d.,:;|/\\·•–—-]*$/.test(text) && text.length < 2)) {
      continue;
    }
    const element = node.parentElement;
    if (!element || ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(element.tagName)) {
      continue;
    }
    const style = getComputedStyle(element);
    if (style.visibility !== "visible" || style.display === "none") {
      continue;
    }
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      continue;
    }
    if (element.closest("[hidden], [aria-hidden='true'], :disabled, [disabled]")) {
      continue;
    }
    // the colour the text really has, with every ancestor's opacity
    let opacity = 1;
    for (let up = element; up && up.nodeType === 1; up = up.parentElement) {
      opacity *= Number(getComputedStyle(up).opacity);
    }
    if (opacity < 0.05) {
      continue;
    }
    if (overPicture(box)) {
      result.unknown += 1;
      continue;
    }
    const candidates = backgroundsOf(element);
    if (!candidates) {
      result.unknown += 1;
      continue;
    }
    const textColor = rgba(style.color);
    textColor[3] *= opacity;
    let got = Infinity;
    let worst = null;
    for (const candidate of candidates) {
      const flat = over(textColor, candidate);
      const value = ratio(flat, candidate);
      if (value < got) {
        got = value;
        worst = candidate;
      }
    }
    const background = [...worst.slice(0, 3), 1];
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    result.checked += 1;
    if (got < need - 0.01) {
      const key = `${path(element)}|${style.color}|${style.backgroundColor}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.bad.push({
        where: path(element),
        text: text.slice(0, 40),
        ratio: Math.round(got * 100) / 100,
        need,
        size: Math.round(size),
        color: style.color,
        background: `rgba(${background.slice(0, 3).map(Math.round)},${Math.round(background[3] * 100) / 100})`
      });
    }
  }
  return result;
}

/** Runs in the page: where the visible headings jump a level (an h1 followed by an h3). */
function headingJumps() {
  const shown = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(heading =>
    heading.checkVisibility()
  );
  const found = [];
  let previous = 0;
  for (const heading of shown) {
    const level = Number(heading.localName[1]);
    if (previous && level > previous + 1) {
      found.push(`h${previous} then h${level} "${heading.textContent.trim().slice(0, 30)}"`);
    }
    previous = level;
  }
  return found;
}

/**
 * Runs in the page: the lane logos (".lane img") that are out of their chip, which is where they must stay: out of the
 * flow (position absolute: they pile up on one another and stretch over the card), or bigger than the chip.
 */
function laneLogos() {
  const stray = [];
  let seen = 0;
  for (const logo of document.querySelectorAll(".lane img")) {
    const box = logo.getBoundingClientRect();
    if (!box.width && !box.height) {
      continue; // not shown
    }
    seen += 1;
    const chip = logo.closest(".lane");
    const frame = chip.getBoundingClientRect();
    const outside =
      box.width > frame.width + 1 ||
      box.height > frame.height + 1 ||
      box.left < frame.left - 1 ||
      box.top < frame.top - 1 ||
      box.right > frame.right + 1 ||
      box.bottom > frame.bottom + 1;
    if (getComputedStyle(logo).position !== "static" || outside) {
      const card = chip.closest("a, article, li, section, div:not(.lanes)")?.className ?? "";
      stray.push(
        `a logo of ${Math.round(box.width)}x${Math.round(box.height)} in a chip of ${Math.round(frame.width)}x${Math.round(frame.height)} (in .${String(card).split(" ")[0]})`
      );
    }
  }
  return { seen, stray };
}

/**
 * Runs in the page (the page of a player): the narrowest card of the grid (104 px, what auto-fill gives at
 * least) with the five lanes there are. Every chip must stay inside the card.
 */
function crowdedCard() {
  const logo = document.querySelector(".pl-hero .lane img")?.getAttribute("src");
  const heroes = document.querySelector(".pl-heroes");
  if (!logo || !heroes) {
    return { stray: ["no hero card to copy on this page"] };
  }
  const chips = Array.from(
    { length: 5 },
    () => `<span class="lane ls-22"><img src="${logo}" alt="" width="22" height="22"></span>`
  ).join("");
  const card = document.createElement("a");
  card.className = "pl-hero keep-dark";
  card.href = "#";
  card.innerHTML = `<span class="image-fallback pl-hero__fallback"></span><span class="pl-hero__lanes"><span class="lanes">${chips}</span></span><span class="pl-hero__name"><b>Five lanes</b><small>x</small></span>`;
  card.style.width = "104px";
  heroes.append(card);
  const frame = card.getBoundingClientRect();
  const stray = [...card.querySelectorAll(".lane")]
    .map(chip => chip.getBoundingClientRect())
    .filter(
      box =>
        box.left < frame.left - 1 || box.right > frame.right + 1 || box.bottom > frame.bottom + 1
    )
    .map(
      box =>
        `a chip at ${Math.round(box.left - frame.left)}px of a card ${Math.round(frame.width)}px wide`
    );
  card.remove();
  return { stray };
}

// a roster as big as the real one: the demonstration series draft 20 heroes per game, five games
const app = await startTestServer({ seedHeroes: false });
if (!app) {
  throw new Error("MySQL is not reachable (docker compose up -d mysql)");
}
// a third of the heroes play two lanes (the page of a player draws them in a row)
await app.store.saveHeroes(
  sampleHeroes(120).map((hero, index) =>
    index % 3 === 0 ? { ...hero, lanes: [hero.lanes[0], LANES[(index + 1) % 5]] } : hero
  ),
  "20260925"
);
app.config.adminEmails.add("demoadmin@demo.test");
const world = await seedDemoWorld({ store: app.store, baseUrl: app.baseUrl });
// the captain has chosen three main heroes, two lanes each: the cards of the page of a player
const saved = await app
  .browser(`hok_session=${world.people.captain.token}`)
  .put("/api/me/player-profile", {
    bio: "",
    lane: "Jungle",
    timezone: "UTC+1",
    languages: ["en"],
    mainHeroes: ["h01", "h04", "h07"]
  });
if (saved.status !== 200) {
  throw new Error(`the profile of the captain was refused: ${saved.status}`);
}

const problems = [];
const check = (label, condition) => {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    problems.push(label);
  }
};

const browser = await chromium.launch();

// the detector itself: text that really is too pale must be found, or a silent run would prove nothing
{
  const probe = await (await browser.newContext()).newPage();
  await probe.setContent(
    '<body style="background:#fff"><p style="color:#bbb;font:15px sans-serif">pale on white</p><p style="color:#222;font:15px sans-serif">dark on white</p></body>'
  );
  const found = await probe.evaluate(audit);
  check(
    "the detector finds pale text and lets dark text through",
    found.bad.length === 1 && found.bad[0].text === "pale on white" && found.checked === 2
  );
  await probe.setContent("<h1>a</h1><h3>c</h3>");
  const jumped = await probe.evaluate(headingJumps);
  await probe.setContent("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>");
  const orderly = await probe.evaluate(headingJumps);
  check(
    "the detector sees a skipped heading level and lets an orderly list through",
    jumped.length === 1 && orderly.length === 0
  );
  // two logos of two lanes in a card, with the rule that once stretched them (and the one that keeps them in their chips)
  const picture = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
  const card = rule =>
    `<style>.card{position:relative;width:120px;height:160px}.card>span{position:absolute;top:8px;left:8px}.lanes{display:inline-flex;gap:4px}.lane{display:inline-grid;width:22px;height:22px;padding:3px}.lane img{width:100%;height:100%;object-fit:contain}${rule}</style><div class="card"><span><span class="lanes"><span class="lane"><img src="${picture}"></span><span class="lane"><img src="${picture}"></span></span></span></div>`;
  await probe.setContent(
    card(".card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}")
  );
  const stretched = await probe.evaluate(laneLogos);
  await probe.setContent(card(""));
  const kept = await probe.evaluate(laneLogos);
  check(
    "the detector finds logos stretched out of their chips and lets logos in their chips through",
    stretched.stray.length === 2 && kept.stray.length === 0 && kept.seen === 2
  );
  await probe.close();
}

let checked = 0;
let logosSeen = 0;
for (const theme of ["dark", "light"]) {
  for (const entry of demoPages(world, "h01")) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce" // nothing fades while the colours are read
    });
    await context.addCookies([
      { name: "hok_theme", value: theme, url: app.baseUrl },
      ...(entry.who
        ? [{ name: "hok_session", value: world.people[entry.who].token, url: app.baseUrl }]
        : [])
    ]);
    const page = await context.newPage();
    await page.goto(`${app.baseUrl}${entry.path}`);
    await page
      .waitForSelector("html[data-ready='1']", { timeout: 20000 })
      .catch(() => problems.push(`${entry.name}: the page never settled`));
    await page.waitForTimeout(500);
    const result = await page.evaluate(audit);
    checked += result.checked;
    check(
      `${entry.name}${entry.who ? ` (${entry.who})` : ""}, ${theme} theme: ${result.checked} texts reach AA${result.unknown ? ` (${result.unknown} over a picture)` : ""}`,
      result.bad.length === 0
    );
    for (const item of result.bad) {
      console.log(
        `     ${item.ratio}:1 (needs ${item.need}) "${item.text}" ${item.size}px in ${item.where}, ${item.color} on ${item.background}`
      );
    }
    if (theme === "dark") {
      // the headings, as a screen reader walks them: a level may go one deeper at a time (the rule of Lighthouse's
      // "heading-order"); the headings that are not shown do not count
      const skipped = await page.evaluate(headingJumps);
      check(`${entry.name}: the headings go down one level at a time`, skipped.length === 0);
      for (const item of skipped) {
        console.log(`     ${item}`);
      }
      if (entry.name === "player") {
        const crowded = await page.evaluate(crowdedCard);
        check(
          "player: a hero with the five lanes keeps them inside its card (a second row)",
          crowded.stray.length === 0
        );
        for (const item of crowded.stray) {
          console.log(`     ${item}`);
        }
      }
      const logos = await page.evaluate(laneLogos);
      logosSeen += logos.seen;
      check(`${entry.name}: the lane logos sit inside their chips`, logos.stray.length === 0);
      for (const item of logos.stray.slice(0, 3)) {
        console.log(`     ${item}`);
      }
    }
    await context.close();
  }
}
check(`the audit read ${checked} pieces of text`, checked > 5000);
check(`and looked at ${logosSeen} lane logos`, logosSeen > 80);

await browser.close();
await app.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\ncontrast e2e passed");
