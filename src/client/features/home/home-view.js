import { icon } from "../../../shared/icons.js";
import { responsive, wide } from "../../../shared/media.js";
import { skeleton } from "../../lib/skeleton.js";
import { api } from "../../app/api-client.js";
import { app, escapeHtml, tell } from "../../lib/dom.js";
import { catalogImageFluid } from "../../domain/catalog-display.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { heroOfTheDay, heroSheet } from "../../domain/hero-of-the-day.js";
import { currentLanguage, number, t } from "../../app/browser-i18n.js";
import { laneLogos, laneName } from "../../domain/lanes.js";
import { render } from "../../app/router.js";
import { canRegister, state } from "../../app/app-state.js";
import { format, kindLabel, roleLabel } from "../community/labels.js";

// The overview: a banner that speaks to the person, their series, the quick ways in, and, when they
// have an account, their next events and teams. Everything shown here is read from the server; a
// block without data says so or is left out.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** The overview numbers, and (with an account) the next events and the teams of the person. */
export async function loadOverview() {
  state.overviewLoading = true;
  try {
    const now = Date.now();
    const signedIn = Boolean(state.auth.user);
    const [overview, agenda, teams] = await Promise.all([
      api("/api/overview"),
      signedIn
        ? api(`/api/me/agenda?from=${now - HOUR}&to=${now + 14 * DAY}`).catch(() => null)
        : null,
      signedIn ? api("/api/me/teams").catch(() => null) : null
    ]);
    state.overview = overview;
    state.home = { events: agenda?.items ?? [], teams: teams?.items ?? [] };
  } catch (error) {
    tell(error.message);
  } finally {
    state.overviewLoading = false;
  }
  if (state.view === "home") {
    render();
  }
}

// ---- words and dates ------------------------------------------------------------------------------

const capitalised = text => text.charAt(0).toLocaleUpperCase(currentLanguage()) + text.slice(1);

/** "in 2 hours", "tomorrow", "yesterday": in the language of the page. */
function relativeTo(time, unit) {
  const formatter = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: "auto" });
  const distance = time - Date.now();
  return unit === "day"
    ? formatter.format(Math.round(distance / DAY), "day")
    : distance >= HOUR
      ? formatter.format(Math.round(distance / HOUR), "hour")
      : formatter.format(Math.max(0, Math.round(distance / 60000)), "minute");
}

const startOfDay = time => new Date(time).setHours(0, 0, 0, 0);

/** "Today · 19:00", "Tomorrow · 14:00", or "Fri, Oct 2 · 19:00". */
function whenLabel(time) {
  const hour = format(time, { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((startOfDay(time) - startOfDay(Date.now())) / DAY);
  const day =
    Math.abs(days) <= 1
      ? capitalised(relativeTo(time + 12 * HOUR - (time % DAY), "day"))
      : format(time, { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${hour}`;
}

const greeting = name => {
  const hour = new Date().getHours();
  const params = { name: escapeHtml(name) };
  return hour >= 5 && hour < 12
    ? t("Good morning, {name}.", params)
    : hour >= 12 && hour < 18
      ? t("Good afternoon, {name}.", params)
      : t("Good evening, {name}.", params);
};

const modeLabel = mode =>
  mode === "global-ban-pick" ? "GBP" : mode === "classic" ? t("Classic") : "FFA";

function statusPill(summary) {
  if (summary.status === "complete") {
    return `<span class="pill">${t("Complete")}</span>`;
  }
  if (summary.status === "draw") {
    return `<span class="pill pill--grey">${t("Series draw")}</span>`;
  }
  // Short on purpose (the column is narrow): the number of the game is on the board itself.
  return summary.currentGameNumber
    ? `<span class="pill pill--live" title="${t("Game {number} in progress", { number: summary.currentGameNumber })}">${t("In progress")}</span>`
    : `<span class="pill pill--blue">${t("Ready")}</span>`;
}

// ---- the banner ----------------------------------------------------------------------------------

/** The events of the person that are still ahead (not their availability windows), soonest first. */
const upcomingEvents = () =>
  (state.home?.events ?? []).filter(
    event => event.kind !== "availability" && event.endsAt > Date.now()
  );

function whosComing(event) {
  const team = (state.home?.teams ?? []).find(item => item.id === event.team.id);
  const going = event.rsvp?.going.length ?? 0;
  const total = Math.max(team?.memberCount ?? 0, going);
  const percent = total ? Math.round((going / total) * 100) : 0;
  const mine = event.rsvp?.mine
    ? `<small class="muted">${t("Your answer: {answer}", {
        answer: { going: t("Going"), maybe: t("Maybe"), no: t("Can’t") }[event.rsvp.mine]
      })}</small>`
    : `<small class="muted">${t("You have not answered yet.")}</small>`;
  return `<aside class="checkin"><div class="between hstack"><b>${t("Who's coming")}</b><span class="pill">${t("{going} of {total} going", { going, total })}</span></div><div class="bar"><i data-p="${percent}"></i></div>${mine}</aside>`;
}

function personalSlide(user) {
  const next = upcomingEvents()[0];
  if (!next) {
    return `<div class="hello__body"><span class="eyebrow">${t("Nothing planned")}</span><h2 class="hello__title">${greeting(user.name)}</h2><p>${t("Create a series to start a draft, or find a team to play against.")}</p><div class="hstack wrap"><button class="btn btn--primary" data-action="new-series">${t("New series")}${icon("plus")}</button><a class="btn btn--ghost" href="/find">${icon("search")}${t("Find a scrim")}</a></div></div>`;
  }
  return `<div class="hello__body"><span class="eyebrow">${escapeHtml(whenLabel(next.startsAt))} · ${escapeHtml(kindLabel(next.kind))}</span><h2 class="hello__title">${greeting(user.name)}</h2><p>${t(
    "Next up: {title} with {team}, {when}.",
    {
      title: `<b>${escapeHtml(next.title)}</b>`,
      team: `<b>${escapeHtml(next.team.name)}</b>`,
      when: `<b class="count-down" data-countdown="${next.startsAt}">${escapeHtml(relativeTo(next.startsAt))}</b>`
    }
  )}</p><div class="hstack wrap"><a class="btn btn--primary" href="/live">${t("Open the draft room")}${icon("arrow")}</a><a class="btn btn--ghost" href="/agenda">${icon("calendar")}${t("See the agenda")}</a></div></div>${whosComing(next)}`;
}

function liveSlide(series) {
  return `<div class="hello__body"><span class="eyebrow">${t("Draft in progress")}</span><h2 class="hello__title">${t("{teamA} vs {teamB}", { teamA: escapeHtml(series.teamA), teamB: escapeHtml(series.teamB) })}</h2><p>${series.currentGameNumber ? t("Game {number} in progress", { number: series.currentGameNumber }) : t("Ready for next game")} · ${t("BO{bestOf}", { bestOf: series.bestOf })} · ${escapeHtml(modeLabel(series.gameMode))}</p><div class="hstack"><button class="btn btn--primary" data-action="open-series" data-series-id="${escapeHtml(series.id)}">${t("Open the draft")}${icon("arrow")}</button></div></div>`;
}

const brandSlide = () =>
  `<div class="hello__body"><span class="eyebrow hstack"><img src="/logo.svg" alt="" width="14" height="17">HOK Global Scrim Lab</span><h2 class="hello__title display">Honor of Kings Global</h2><p class="display-sub">${t("Draft, scrims, training.")}</p><p>${t("Prepare your scrims, improve your game, explore the heroes and build your team on HOK Global Scrim Lab.")}</p><div class="hstack"><a class="btn btn--primary" href="/find">${t("Find a scrim")}${icon("arrow")}</a></div></div>`;

/** "Create account" then "Sign in"; the sign-in alone, as the main button, when the server takes no new accounts. */
const joinButtons = (arrow = "") =>
  canRegister()
    ? `<a class="btn btn--primary" href="/register">${t("Create account")}${arrow}</a><a class="btn btn--ghost" href="/login">${t("Sign in")}</a>`
    : `<a class="btn btn--primary" href="/login">${t("Sign in")}${arrow}</a>`;

const joinSlide = () =>
  `<div class="hello__body"><span class="eyebrow">${t("Free account")}</span><h2 class="hello__title">${t("Keep your series, play online.")}</h2><p>${t("Create an account to save your scrims, play online with an invited opponent, share tier lists and join a team.")}</p><div class="hstack wrap">${joinButtons(icon("arrow"))}</div></div>`;

function banner() {
  const user = state.auth.user;
  const live = state.overview.active[0];
  const slides = user
    ? [personalSlide(user), live ? liveSlide(live) : "", brandSlide()]
    : [brandSlide(), joinSlide()];
  const shown = slides.filter(Boolean);
  return `<section class="hello card--blue keep-dark rise" id="hello" aria-roledescription="carousel" aria-label="${t("Highlights")}"><div class="hello__art" id="hello-art"></div>${heroCredit()}${shown
    .map(
      (slide, index) =>
        `<div class="hello__slide${index ? "" : " is-on"}" data-slide="${index}" role="group" aria-roledescription="slide" aria-label="${index + 1} / ${shown.length}"${index ? " inert" : ""}>${slide}</div>`
    )
    .join("")}${
    shown.length > 1
      ? `<button type="button" class="hello__arrow hello__arrow--prev" data-hello="-1" aria-label="${t("Previous")}">${icon("left", "i--lg")}</button><button type="button" class="hello__arrow hello__arrow--next" data-hello="1" aria-label="${t("Next")}">${icon("right", "i--lg")}</button><div class="dots" role="group" aria-label="${t("Highlights")}">${shown.map((_, index) => `<button type="button" data-hello-to="${index}" aria-label="${index + 1} / ${shown.length}"${index ? "" : ' class="on" aria-current="true"'}></button>`).join("")}</div>`
      : ""
  }</section>`;
}

// ---- the series ----------------------------------------------------------------------------------

function seriesRow(summary) {
  const day = format(summary.updatedAt, { weekday: "short", day: "numeric", month: "short" });
  const hour = format(summary.updatedAt, { hour: "2-digit", minute: "2-digit" });
  const { teamA, teamB } = summary.score;
  const done = summary.status === "complete";
  return `<button type="button" class="match" data-action="open-series" data-series-id="${escapeHtml(summary.id)}"><span class="match__date"><b>${escapeHtml(day)}</b><small>${escapeHtml(hour)} · ${t("BO{bestOf}", { bestOf: summary.bestOf })}</small></span><span class="match__team">${teamEmblem(summary.teamA, 36)}<span>${escapeHtml(summary.teamA)}</span></span><span class="match__vs">vs</span><span class="match__team">${teamEmblem(summary.teamB, 36)}<span>${escapeHtml(summary.teamB)}</span></span><span class="match__score"><span${done && teamA > teamB ? ' class="w"' : done && teamA < teamB ? ' class="l"' : ""}>${teamA}</span> - <span${done && teamB > teamA ? ' class="w"' : done && teamB < teamA ? ' class="l"' : ""}>${teamB}</span></span>${statusPill(summary)}${icon("right")}</button>`;
}

function eventCard(event) {
  return `<a class="event" href="/agenda">${teamEmblem(event.team, 46)}<span><b>${escapeHtml(event.title)}</b><small>${escapeHtml(whenLabel(event.startsAt))}</small><span class="pill">${escapeHtml(kindLabel(event.kind))}</span></span>${icon("right")}</a>`;
}

const empty = (iconName, title, text, action = "") =>
  `<div class="empty-row">${icon(iconName)}<span><b>${title}</b> ${text}</span>${action}</div>`;

/** The list under the tabs: the person's series, what is planned, or what is finished. */
export function homeList(tab) {
  const { active, recent } = state.overview;
  if (tab === "next") {
    const events = upcomingEvents().slice(0, 5);
    return events.length
      ? events.map(eventCard).join("")
      : empty(
          "calendar",
          t("Nothing planned"),
          state.auth.user
            ? t("Events of your teams show up here.")
            : t("Sign in to see the agenda of your teams."),
          state.auth.user
            ? `<a class="btn btn--sm" href="/agenda">${t("Agenda")}</a>`
            : `<a class="btn btn--sm" href="/login">${t("Sign in")}</a>`
        );
  }
  const rows =
    tab === "past"
      ? recent.filter(item => item.status !== "active")
      : [...active, ...recent.filter(item => item.status !== "active")];
  return rows.length
    ? rows.slice(0, 5).map(seriesRow).join("")
    : empty(
        "swords",
        t("No results yet"),
        t("Completed games will be recorded here."),
        `<button type="button" class="btn btn--primary btn--sm" data-action="new-series">${t("Create series")}</button>`
      );
}

// ---- the page ------------------------------------------------------------------------------------

function eventsCard() {
  const user = state.auth.user;
  if (!user) {
    return `<section class="card card--feature join rise d-1"><h2>${t("Free account")}</h2><p>${t("Create an account to save your scrims, play online with an invited opponent, share tier lists and join a team.")}</p><ul class="join__list"><li>${icon("swords", "i--sm")}<span>${t("Keep your series")}</span></li><li>${icon("calendar", "i--sm")}<span>${t("Plan scrims with your team")}</span></li><li>${icon("trophy", "i--sm")}<span>${t("Share tier lists")}</span></li></ul><div class="hstack wrap">${joinButtons()}</div></section>`;
  }
  const events = upcomingEvents().slice(0, 3);
  return `<section class="card rise d-1"><div class="card__head"><h2>${t("Next events")}</h2><a class="link" href="/agenda">${t("See all")}</a></div><div class="list">${
    events.length
      ? events.map(eventCard).join("")
      : `<a class="empty-line" href="/agenda">${icon("calendar", "i--sm")}<span>${t("Events of your teams show up here.")}</span>${icon("right", "i--sm")}</a>`
  }</div></section>`;
}

/** Three steps for someone who has not played yet: the product in a glance (nothing here is a number). */
const startCard = () =>
  `<section class="card rise d-2 start"><div class="card__head"><h2>${t("Get started")}</h2></div><ol class="start__steps"><li>${icon("swords", "i--lg")}<span><b>${t("Pick a mode and start")}</b><small>${t("Alone, on one shared device, or online against an invited opponent.")}</small></span></li><li>${icon("clock", "i--lg")}<span><b>${t("Draft with the clock")}</b><small>${t("Bans and picks follow the real order, with a timer on every turn.")}</small></span></li><li>${icon("trophy", "i--lg")}<span><b>${t("Review and share")}</b><small>${t("Every game is kept: export it, share a link, or build tier lists from it.")}</small></span></li></ol><button type="button" class="btn btn--primary btn--block" data-action="new-series">${t("New series")}${icon("plus")}</button></section>`;

const trainingCard = () =>
  `<section class="card card--blue keep-dark train rise d-2"><span class="train__ico">${icon("target", "i--lg")}</span><div><h2>${t("Training")}</h2><p>${t("Improve your mechanics, review your combos and work on game situations.")}</p><div class="train__skills">${laneLogos(["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"], 28)}</div><a class="btn btn--primary" href="/training">${t("Open")}${icon("arrow")}</a></div></section>`;

function teamsCard() {
  const teams = state.home?.teams ?? [];
  if (!state.auth.user) {
    return "";
  }
  return `<section class="card rise d-3"><div class="card__head"><h2>${t("My teams")}</h2><a class="link" href="/teams">${t("See all")}</a></div><div class="list">${
    teams.length
      ? teams
          .slice(0, 3)
          .map(
            team =>
              `<a class="teamrow" href="/teams/${encodeURIComponent(team.id)}">${teamEmblem(team, 46)}<span><b>${escapeHtml(team.name)}</b><small><em>${escapeHtml(roleLabel(team.myRole))}</em> · ${t("{count, plural, one {# member} other {# members}}", { count: team.memberCount })}</small></span>${icon("right")}</a>`
          )
          .join("")
      : `<a class="empty-line" href="/teams">${icon("shieldcheck", "i--sm")}<span>${t("Create a team or accept an invitation to see it here.")}</span>${icon("right", "i--sm")}</a>`
  }</div></section>`;
}

/** The four numbers of the app, in a row, with the rule of the data under them. */
function statsStrip(counts) {
  const tile = (iconName, value, label) =>
    `<div class="home-figure">${icon(iconName, "i--lg")}<b>${number(value)}</b><span>${label}</span></div>`;
  return `<section class="home-figures rise d-4" aria-label="${t("Quick stats")}">${tile("book", counts.heroes, t("Heroes"))}${tile("swords", counts.games, t("Games recorded"))}${tile("trophy", counts.tierLists, t("Tier lists"))}${tile("bolt", counts.activeSeries, t("Active series"))}<p class="note">${icon("info", "i--sm")}<span><b>${t("Global data only")}</b> ${t("No ranked and no ladder data. Your own statistics stay hidden until there are enough games.")}</span></p></section>`;
}

// ---- the heroes rail -----------------------------------------------------------------------------

const RAIL_LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];
const RAIL_SIZE = 12;
// What the picture of a portrait is drawn at: the columns of the rail divide twelve (12, 6, 4, 3) and the
// rail touches both edges of its card, so the width of a portrait is the width of the page over the columns.
// The sources are 128 px heads that cover a 3:4 portrait, so they are drawn as wide as the portrait is tall: 4/3 of the
// width of a column (the server enlarges them: see shared/media.js).
const RAIL_SIZES =
  "(min-width: 1240px) calc((min(100vw, 1500px) - 56px) / 9), (min-width: 641px) calc((100vw - 56px) / 4.5), (min-width: 360px) calc((100vw - 56px) / 3), calc((100vw - 56px) / 2.25)";

/** The portraits of the rail: the heroes of one lane (all lanes at first), a dozen of them. */
export function heroRail(lane = "All") {
  const pool = state.heroes.filter(
    hero =>
      hero.availableGlobal !== false && hero.image && (lane === "All" || hero.lanes?.includes(lane))
  );
  // always the same ones for a day, whatever the lane: the day number picks where the dozen starts
  const day = Math.floor(Date.now() / DAY);
  const start = pool.length ? (day * 7) % pool.length : 0;
  const shown = [...pool.slice(start), ...pool.slice(0, start)].slice(0, RAIL_SIZE);
  return shown
    .map(
      hero =>
        `<button type="button" class="rail-card" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}"><img ${responsive(hero.image, 160, RAIL_SIZES)} alt="" width="128" height="171" loading="lazy" decoding="async"><span class="rail-card__name">${escapeHtml(hero.displayName || hero.name)}</span></button>`
    )
    .join("");
}

function heroesCard(counts) {
  const tabs = ["All", ...RAIL_LANES]
    .map(
      lane =>
        `<button type="button" class="${lane === "All" ? "on" : ""}" data-action="home-lane" data-lane="${escapeHtml(lane)}" aria-pressed="${lane === "All"}">${lane === "All" ? t("All lanes") : escapeHtml(laneName(lane))}</button>`
    )
    .join("");
  return `<section class="card card--flush rise d-1 heroes-card"><div class="card__head"><h2>${t("Heroes")}</h2><div class="rail-tabs" role="group" aria-label="${t("Lane")}">${tabs}</div><a class="link" href="/heroes">${t("See all {count} heroes", { count: number(counts.heroes) })}${icon("right", "i--sm")}</a></div><div class="hero-rail" id="hero-rail">${heroRail("All")}</div></section>`;
}

// ---- the game data band --------------------------------------------------------------------------

const BAND_TILES = [
  ["items", "/items", "gem", "Items"],
  ["arcana", "/arcana", "star", "Arcana"],
  ["spells", "/spells", "bolt", "Spells"]
];

// The pictures of a tile fill it from edge to edge in equal columns: five by two beside each other, five by two
// stacked on a phone, ten in a row in between. The cell is the width of the page over those columns.
const TILE_SIZES =
  "(min-width: 901px) calc((min(100vw, 1500px) - 88px) / 15), (min-width: 561px) calc((100vw - 56px) / 10), calc((100vw - 56px) / 5)";

/** Three tiles, each a mosaic of the real pictures of the catalogue (the overview carries them). */
const dataBand = () => {
  const data = state.overview.gameData ?? {};
  return `<section class="data-band rise d-3" aria-label="${t("Game data")}">${BAND_TILES.map(
    ([key, href, iconName, label]) => {
      const { count = 0, images = [] } = data[key] ?? {};
      return `<a class="data-tile" href="${href}"><span class="data-tile__head">${icon(iconName)}<b>${t(label)}</b><em class="data-tile__count">${number(count)}</em></span><span class="data-tile__icons">${images
        .map(
          id =>
            `<img class="piece-image" ${catalogImageFluid(id, TILE_SIZES)} alt="" width="128" height="128" loading="lazy" decoding="async">`
        )
        .join("")}</span></a>`;
    }
  ).join("")}</section>`;
};

/** The name of the hero of the day on the banner (the roster is loaded: the page says it at once). */
const heroCredit = () => {
  const hero = heroOfTheDay();
  return hero
    ? `<button type="button" class="hello__credit" data-action="open-hero" data-hero-id="${escapeHtml(hero.id)}">${hero.image ? `<img ${responsive(hero.image, 72, "72px")} alt="" width="72" height="72" decoding="async">` : ""}<span><small>${t("Hero of the day")}</small><b>${escapeHtml(hero.displayName || hero.name)}</b></span></button>`
    : "";
};

/** The cover art of the hero of the day behind the banner, once its sheet is read (no art, no image). */
async function fillBannerArt() {
  const slot = document.querySelector("#hello-art");
  const hero = heroOfTheDay();
  if (!slot || !hero) {
    return;
  }
  const cover = (await heroSheet(hero))?.art?.cover;
  if (!cover || !slot.isConnected) {
    return;
  }
  slot.innerHTML = `<img ${wide(cover, [640, 960, 1280, 1920], "100vw")} alt="" decoding="async">`;
  slot.classList.add("is-on");
}

export function renderHome() {
  const overview = state.overview;
  if (!overview) {
    app.innerHTML = skeleton("page");
    return;
  }
  const { counts } = overview;
  const tab = state.homeTab;
  const tabs = [
    ["mine", t("My scrims")],
    ["next", t("Upcoming")],
    ["past", t("Past")]
  ];
  app.innerHTML = `<h1 class="visually-hidden">${t("Scrim operations")}</h1>
    ${banner()}
    ${statsStrip(counts)}
    <div class="home-cards">${eventsCard()}${state.auth.user ? teamsCard() : startCard()}${trainingCard()}</div>
    <div class="stack-y">
      ${heroesCard(counts)}
      <section class="card home-list-card rise d-2"><div class="tabrow"><div class="tabs" role="tablist" aria-label="${t("Your scrims")}">${tabs
        .map(
          ([id, label]) =>
            `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? "on" : ""}" data-action="home-tab" data-tab="${id}">${label}</button>`
        )
        .join(
          ""
        )}</div><a class="btn btn--primary btn--sm" href="/scrims">${t("See all")}</a></div><div class="list home-list" id="home-list" role="tabpanel">${homeList(tab)}</div></section>
      ${dataBand()}
    </div>`;
  fillBannerArt();
}
