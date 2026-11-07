// One route table for the browser (client-side navigation) and the server (real titles,
// descriptions, status codes). Pure: importable from Node tests.

export const SITE_NAME = "HOK Global Scrim Lab";

import { ROUTES } from "./routes-table.js";
import { message } from "./routes-shared.js";
import { splitLanguage } from "./locale-path.js";

export const AUTH_VIEWS = ["login", "mfa", "setup", "profile", "register", "account"];

/** The pages of the legal text and the contact form: public, written once for everybody (client/features/legal). */
export const LEGAL_VIEWS = ["terms", "privacy", "cookies", "legal", "contact"];

export const NOT_FOUND = {
  view: "not-found",
  index: false,
  title: message("Page not found | {site}"),
  description: message("This page does not exist.")
};

/** Pathname -> { view, heroId?, seriesId?, route }. Unknown paths give the not-found view. */
export function matchRoute(pathname) {
  // /fr/heroes is the French page of /heroes (shared/locale-path.js): the language prefix names no page
  const bare = splitLanguage(pathname).path;
  const clean = bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
  for (const route of ROUTES) {
    const match = route.pattern.exec(clean);
    if (match) {
      return { view: route.view, route, ...(route.param ? { [route.param]: match[1] } : {}) };
    }
  }
  return { view: NOT_FOUND.view, route: NOT_FOUND };
}

/**
 * The title and the description of a matched address (both keys, to translate): a page whose address ends
 * with a section of its own (/popular/heroes, /training/reflex/...) takes the texts of that section.
 */
export function routeTexts(match) {
  const route = match.route;
  const section = match.section ?? "";
  const own = Object.entries(route.sections ?? {}).find(
    ([start]) => section === start || section.startsWith(`${start}/`)
  )?.[1];
  return { title: own?.title ?? route.title, description: own?.description ?? route.description };
}

/** Views whose address is not simply "/" followed by their name. */
const OWN_PATH = {
  home: "/",
  mfa: "/login/mfa",
  setup: "/login/setup",
  profile: "/login/profile",
  "space-shared": "/space/shared",
  "me-api": "/me/api"
};
/** The views with an address of their own and no value in it: every route of the table that takes none. */
const PLAIN_VIEWS = new Set(ROUTES.filter(route => !route.param).map(route => route.view));
/** The views whose address ends with a value: the folder, and the name the value is given under. */
const WITH_VALUE = {
  hero: ["/heroes", "heroId"],
  guides: ["/guides", "guideHeroId"],
  scrims: ["/scrims", "seriesId"],
  team: ["/teams", "teamId"],
  player: ["/players", "tag"],
  "casino-roll": ["/casino", "casinoId"]
};
/** The views whose address may end with a section (already starting with a slash). */
const WITH_SECTION = {
  training: "/training",
  popular: "/popular",
  "tier-list": "/tier-list",
  items: "/items",
  arcana: "/arcana",
  spells: "/spells"
};

/** The URL of a view (the inverse of matchRoute). */
export function pathFor({ view, section = "", ...values }) {
  if (view in WITH_SECTION) {
    return `${WITH_SECTION[view]}${section ?? ""}`;
  }
  const [folder, name] = WITH_VALUE[view] ?? [];
  if (name && values[name]) {
    return `${folder}/${encodeURIComponent(values[name])}`;
  }
  if (!PLAIN_VIEWS.has(view)) {
    return "/";
  }
  return OWN_PATH[view] ?? `/${view}`;
}

/**
 * What the top bar shows a visitor who is not signed in: the two buttons, the first one coming back to `here` after the
 * sign-in. The server draws it into the page and the browser draws it again, so the bar does not change size when the
 * script starts (`signIn` and `createAccount` are the texts, already translated and escaped). Without `createAccount`
 * (the server does not take new accounts) the bar has the sign-in button alone, as the main one.
 */
export function visitorAccountButtons(here, signIn, createAccount) {
  const signInLink = `<a class="btn ${createAccount ? "btn--ghost" : "btn--primary"}" href="/login?next=${encodeURIComponent(safeNext(here))}">${signIn}</a>`;
  return createAccount
    ? `${signInLink}<a class="btn btn--primary" href="/register">${createAccount}</a>`
    : signInLink;
}

/** Only same-site absolute paths are accepted as a post-login destination. */
export function safeNext(value) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  ) {
    return "/";
  }
  try {
    const url = new URL(value, "http://next.invalid");
    if (url.origin !== "http://next.invalid") {
      return "/";
    }
    if (
      matchRoute(url.pathname).view === "not-found" ||
      AUTH_VIEWS.includes(matchRoute(url.pathname).view)
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}
