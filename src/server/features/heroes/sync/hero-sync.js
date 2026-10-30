import { chromium } from "playwright";
import { normalizeBriefList, normalizeHeroDetails, normalizeLocalizedNames } from "../camp-data.js";
import { createStallGuard, isSilence } from "./stall-guard.js";

// HOK Camp (Global, English). Its pages sign their own API calls, so we let the real page make them
// in headless Chromium and read the responses (no reverse-engineered signature, no third-party
// daemon).
const campBase = lang =>
  `https://camp.honorofkings.com/h5/app/index.html?lang_type=${encodeURIComponent(lang)}`;
const CAMP_BASE = campBase("en");
const API = "https://api-camp.honorofkings.com";

/**
 * Headless Chromium for roster sync and PDF export. The container is the sandbox in Docker
 * (CHROMIUM_NO_SANDBOX=true there).
 */
export function launchChromium() {
  const args =
    process.env.CHROMIUM_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-dev-shm-usage"]
      : ["--disable-dev-shm-usage"];
  return chromium.launch({ headless: true, args });
}

async function validateImages(requestContext, heroes) {
  await Promise.all(
    heroes.slice(0, 3).map(async hero => {
      const response = await requestContext.get(hero.image, { timeout: 12000 });
      if (!response.ok() || !response.headers()["content-type"]?.startsWith("image/")) {
        throw new Error(`Camp portrait is unavailable: ${hero.image}`);
      }
    })
  );
}

function waitForApi(page, endpoint, matches = () => true, timeout = 30000) {
  return page
    .waitForResponse(
      response => {
        const request = response.request();
        return (
          response.url() === `${API}${endpoint}` &&
          request.method() === "POST" &&
          matches(request.postData() ?? "")
        );
      },
      { timeout }
    )
    .then(async response => {
      if (!response.ok()) {
        throw new Error(`Camp returned HTTP ${response.status()} for ${endpoint}.`);
      }
      return response.json();
    });
}

/**
 * The roster: Camp's own hero list. It carries no ranked data at all (unlike the popularity
 * ranking).
 */
export async function fetchOfficialRoster() {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ locale: "en-US" });
    const listing = waitForApi(page, "/api/herowiki/getallherobriefinfo");
    await page.goto(`${CAMP_BASE}#/adjustment-detail?heroId=123`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    const payload = await listing;
    const heroes = normalizeBriefList(payload);
    await validateImages(page.request, heroes);
    return { heroes, sourceUpdated: new Date().toISOString().slice(0, 10).replaceAll("-", "") };
  } finally {
    await browser.close();
  }
}

/**
 * Names and classes of the heroes in another language (Camp Global serves them under
 * lang_type=<code>).
 */
export async function fetchHeroNames(lang, knownIds) {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const listing = waitForApi(page, "/api/herowiki/getallherobriefinfo");
    await page.goto(`${campBase(lang)}#/adjustment-detail?heroId=123`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    return normalizeLocalizedNames(await listing, knownIds);
  } finally {
    await browser.close();
  }
}

/**
 * The wait for a hero's sheet. It is awaited a little later, and on a slow page its 30 s can run
 * out before that: the no-op handler keeps that from being an unhandled rejection.
 */
function waitForSheet(page, heroId) {
  const wait = waitForApi(page, "/api/herowiki/getherodataall", body =>
    body.includes(`"heroId":${heroId}`)
  );
  wait.catch(() => {});
  return wait;
}

/** A fresh page on one hero's sheet; its first request is already being waited for. */
async function openSheet(browser, lang, heroId) {
  const page = await browser.newPage({ locale: "en-US" });
  try {
    const detail = waitForSheet(page, heroId);
    await page.goto(`${campBase(lang)}#/hero-detail?heroId=${heroId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    return { page, detail };
  } catch (error) {
    await page.close().catch(() => {});
    throw error;
  }
}

/**
 * Hero sheets (skills, lore, gallery, patch history) for the given Camp hero ids, one at a time.
 * `onHero(heroId, details | null, error)` is called after each hero so progress is saved
 * incrementally. Ranked fields in the responses are never read (see features/heroes/camp-data.js).
 * A page that stops answering is replaced, then given up on (see stall-guard.js), instead of
 * costing 30 s per remaining hero.
 */
export async function fetchHeroDetails(
  heroIds,
  { onHero, delayMs = 400, shouldStop = () => false, lang = "en", launch = launchChromium } = {}
) {
  const browser = await launch();
  const guard = createStallGuard();
  try {
    let sheet = await openSheet(browser, lang, heroIds[0]);
    let pending = sheet.detail;
    let stuck = false;
    for (let index = 0; index < heroIds.length; index += 1) {
      if (shouldStop()) {
        break;
      }
      const heroId = heroIds[index];
      try {
        if (stuck) {
          const fresh = await openSheet(browser, lang, heroId);
          await sheet.page.close().catch(() => {});
          sheet = fresh;
          pending = fresh.detail;
          stuck = false;
        } else if (index > 0) {
          pending = waitForSheet(sheet.page, heroId);
          await sheet.page.evaluate(id => {
            location.hash = `#/hero-detail?heroId=${id}`;
          }, heroId);
        }
        const detailPayload = await pending;
        guard.answered();
        const adjustWait = waitForApi(
          sheet.page,
          "/api/game/adjust/adjustheroinfo",
          body => body.includes(`"${heroId}"`),
          20000
        ).catch(() => null);
        await sheet.page.evaluate(id => {
          location.hash = `#/adjustment-detail?heroId=${id}`;
        }, heroId);
        const adjustPayload = await adjustWait;
        const details = normalizeHeroDetails(detailPayload, adjustPayload);
        if (details.campHeroId !== String(heroId)) {
          throw new Error("Camp answered with a different hero id.");
        }
        await onHero?.(String(heroId), details, null);
      } catch (error) {
        await onHero?.(String(heroId), null, error);
        if (!isSilence(error)) {
          guard.answered();
        } else {
          const verdict = guard.silent();
          if (verdict === "give-up") {
            throw new Error("Camp stopped answering; the sheets left wait for the next pass.", {
              cause: error
            });
          }
          stuck ||= verdict === "reload";
        }
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  } finally {
    await browser.close();
  }
}
