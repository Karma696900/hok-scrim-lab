// What the training pages have in common: the values of the notebook and of the map, the words for
// them, and what every page of the area wears at its top: the stage (the cover of a hero, the title and
// three big numbers) and the four entries (heroes, notebook, situations, reflex) with how far the
// person is in each of them.
import { icon } from "../../../shared/icons.js";
import { EXERCISES, ROUTINES } from "../../../shared/reflex-model.js";
import { number, t } from "../../app/browser-i18n.js";
import { fillSceneArt } from "../../domain/scene-art.js";
import { state } from "../../app/app-state.js";
import { stageHtml } from "../community/stage.js";

export const NOTE_KINDS = ["goal", "mechanic", "combo", "vod"];
export const STATUSES = ["todo", "practicing", "mastered"];
export const PIN_KINDS = ["camp", "buff", "objective", "tower", "bush"];
/** How many heroes a player can work on. */
export const FOCUS_MAX = 30;

/** The words for the two forms of a combo (see COMBO_FORMS in shared/combo-model.js). */
export const comboFormLabel = form => (form === "normal" ? t("Normal") : t("Animation cancel"));

export const kindLabel = kind =>
  ({ goal: t("Goal"), mechanic: t("Mechanic"), combo: t("Combo"), vod: t("Video review") })[kind] ??
  kind;
/** The words for a status; a video is watched and reviewed rather than practised and mastered. */
export const statusLabel = (status, kind = "") =>
  (kind === "vod"
    ? { todo: t("To watch"), practicing: t("Being reviewed"), mastered: t("Reviewed") }
    : { todo: t("To do"), practicing: t("Practising"), mastered: t("Mastered") })[status] ?? status;
export const pinLabel = kind =>
  ({
    camp: t("Camp"),
    buff: t("Buff"),
    objective: t("Objective"),
    tower: t("Tower"),
    bush: t("Bush"),
    hero: t("Hero")
  })[kind] ?? kind;
export const sideLabel = side =>
  side === "blue" ? t("Blue side") : side === "red" ? t("Red side") : t("Neutral");

/** The icon of a kind of note. */
export const KIND_ICONS = { goal: "flag", mechanic: "book", combo: "bolt", vod: "video" };

// One simple glyph per kind of pin (24 × 24, drawn with the line of the other icons).
const GLYPHS = {
  camp: "M3 20 12 5l9 15zM12 20v-6",
  buff: "M12 3l7 9-7 9-7-9z",
  objective: "M8 3h8l5 5v8l-5 5H8l-5-5V8zM12 9v6",
  tower: "M7 21V9l2-2V4h2v2h2V4h2v3l2 2v12zM10 21v-5h4v5",
  bush: "M4 19c0-4 3-6 5-6 0-3 2-6 5-6 3 0 5 3 5 6 2 0 3 2 3 4v2z"
};
export const glyph = kind =>
  `<svg class="i i--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${GLYPHS[kind]}"/></svg>`;

export const newPinId = () => Math.random().toString(36).slice(2, 10).padEnd(4, "0");

// ---- the four entries -----------------------------------------------------------------------------------
/** The zones of the area, in the order of the entries. */
const ZONES = ["heroes", "notebook", "scenarios", "reflex"];
const ZONE_PATH = { heroes: "", notebook: "/notebook", scenarios: "/scenarios", reflex: "/reflex" };
const ZONE_ICON = { heroes: "shield", notebook: "book", scenarios: "map", reflex: "bolt" };
export const zoneName = zone =>
  ({
    heroes: t("Heroes"),
    notebook: t("Notebook"),
    scenarios: t("Situations"),
    reflex: t("Reflex")
  })[zone];
const zoneBlurb = zone =>
  ({
    heroes: t("The heroes you work on, with everything needed to master them."),
    notebook: t(
      "What to practise: goals, mechanics, combos and video reviews. Only you can see it."
    ),
    scenarios: t(
      "Situations prepared by the administrators: place yourself on the map and decide what to do."
    ),
    reflex: t(
      "Short exercises for your reflexes, memory and aim. They run in your browser and send nothing while you play."
    )
  })[zone];

const percent = (done, total) => (total ? Math.round((Math.min(done, total) / total) * 100) : 0);

/**
 * The numbers the stage and the entries show, from what the area loaded for the person (`overview`:
 * the heroes worked on, what the teams ask, the combos to check, the notes, the situations and the
 * reflex summary). Null for a visitor: nothing of theirs is known.
 */
function summarise(overview) {
  if (!overview) {
    return null;
  }
  const goals = [
    ...overview.assigned.teams.flatMap(entry => entry.heroGoals),
    ...(overview.reflex?.teams ?? []).flatMap(entry => entry.goals)
  ];
  return {
    heroes: overview.focus.length,
    due: overview.review?.dueTotal ?? 0,
    goals: goals.length,
    goalsDone: goals.filter(goal => goal.progress?.complete).length,
    notes: overview.notes.length,
    mastered: overview.notes.filter(note => note.status === "mastered").length,
    situations: overview.scenarios.length,
    playedToday: overview.reflex?.doneToday.length ?? 0
  };
}

/** The three big numbers of the stage; for a visitor, what the area holds. */
function figuresOf(summary, pending = false) {
  if (pending) {
    return [
      ["–", t("Heroes worked on"), "trn-fig-heroes"],
      ["–", t("Combos to check today"), "trn-fig-due"],
      ["–", t("Objectives"), "trn-fig-goals"]
    ];
  }
  if (!summary) {
    return [
      [number(state.heroes.filter(hero => hero.availableGlobal !== false).length), t("Heroes")],
      [number(EXERCISES.length), t("Exercises")],
      [number(ROUTINES.length), t("Routines")]
    ];
  }
  return [
    [number(summary.heroes), t("Heroes worked on"), "trn-fig-heroes"],
    [number(summary.due), t("Combos to check today"), "trn-fig-due"],
    [
      summary.goals ? `${number(summary.goalsDone)}/${number(summary.goals)}` : number(0),
      t("Objectives"),
      "trn-fig-goals"
    ]
  ];
}

const stat = (value, label) => `<span class="trn-tab__stat"><b>${value}</b> ${label}</span>`;

/** What an entry says about the person's work: a line of small figures, and the share of a bar (or null). */
function entryInfo(zone, summary, pending = false) {
  if (pending) {
    const label = {
      heroes: t("Heroes"),
      notebook: t("Notes"),
      scenarios: t("Situations"),
      reflex: t("Played today")
    }[zone];
    return { line: stat("–", label), share: null };
  }
  if (!summary) {
    return { line: zoneBlurb(zone), share: null };
  }
  if (zone === "heroes") {
    return {
      line:
        stat(number(summary.heroes), t("Heroes")) +
        (summary.due ? stat(number(summary.due), t("To check")) : ""),
      share: summary.goals ? percent(summary.goalsDone, summary.goals) : null
    };
  }
  if (zone === "notebook") {
    return {
      line:
        stat(number(summary.notes), t("Notes")) +
        (summary.mastered ? stat(number(summary.mastered), t("Mastered")) : ""),
      share: summary.notes ? percent(summary.mastered, summary.notes) : null
    };
  }
  if (zone === "scenarios") {
    return { line: stat(number(summary.situations), t("Situations")), share: null };
  }
  return {
    line: stat(`${number(summary.playedToday)}/${number(EXERCISES.length)}`, t("Played today")),
    share: percent(summary.playedToday, EXERCISES.length)
  };
}

/** The four entries: icon, name, how far the person is. `active` is the zone that is open. */
function entriesHtml(active, summary, pending = false) {
  return `<nav class="trn-tabs training-tabs" aria-label="${t("Training sections")}">${ZONES.map(
    zone => {
      const { line, share } = entryInfo(zone, summary, pending);
      const on = zone === active;
      return `<a class="trn-tab${on ? " on" : ""}" data-zone="${zone}" href="/training${ZONE_PATH[zone]}"${on ? ' aria-current="page"' : ""}><span class="trn-tab__icon">${icon(ZONE_ICON[zone])}</span><span class="trn-tab__body"><b class="trn-tab__name">${zoneName(zone)}</b><span class="trn-tab__line">${line}</span></span>${share === null ? "" : `<span class="bar trn-tab__bar" aria-hidden="true"><i data-p="${share}"></i></span>`}</a>`;
    }
  ).join("")}</nav>`;
}

/**
 * What the stage of a zone says at its top: the title, the line under it, the main action. The page of the zone draws
 * its stage with it, and so does the frame that is drawn before the page has its data: they must agree, or the title
 * would change under the eyes of the person.
 */
export function zoneHead(zone, { admin = false } = {}) {
  const heads = {
    heroes: {
      title: t("Your training"),
      text: t("The heroes you work on, with everything needed to master them."),
      actions: `<button type="button" class="btn btn--primary btn--lg" data-focus-search>${icon("search")}${t("Choose your heroes")}</button>`
    },
    notebook: {
      title: t("Notebook"),
      text: t("What to practise: goals, mechanics, combos and video reviews. Only you can see it."),
      actions: `<button type="button" class="btn btn--primary btn--lg" data-new>${icon("plus")}${t("New note")}</button>`
    },
    scenarios: {
      title: t("Situations"),
      text: t(
        "Situations prepared by the administrators: place yourself on the map and decide what to do."
      ),
      actions: admin
        ? `<button class="btn btn--primary btn--lg" type="button" data-new-scenario>${icon("plus")}${t("New situation")}</button>`
        : ""
    },
    reflex: {
      title: t("Reflex training"),
      text: t(
        "Short exercises for your reflexes, memory and aim. They run in your browser and send nothing while you play."
      ),
      actions: ""
    }
  };
  return heads[zone];
}

/**
 * What opens every page of the area: the stage, then the four entries. `back` ({ href, label }) puts a
 * way back above the title; `slim` makes the stage lower (an exercise, a situation); `entries: false`
 * leaves the four entries out (the pages that are one step inside a zone).
 */
export function chromeHtml({
  zone = "",
  hero,
  title,
  text = "",
  actions = "",
  back = null,
  slim = false,
  entries = true,
  figures = null,
  overview = null,
  pending = false,
  cls = ""
}) {
  const summary = summarise(overview);
  const lead = back
    ? `<div class="crumb"><a href="${back.href}">${icon("left", "i--sm")}${back.label}</a></div>`
    : "";
  return `<div id="trn-chrome" class="trn-chrome">${stageHtml({
    cls: `trn-stage${slim ? " cm-stage--slim" : ""}${cls ? ` ${cls}` : ""}`,
    hero,
    lead,
    title,
    text,
    actions,
    figures: figures ?? figuresOf(summary, pending)
  })}${entries ? entriesHtml(zone, summary, pending) : ""}</div>`;
}

/**
 * Brings the numbers of the stage and of the entries up to date, and the cover when the hero changed,
 * without drawing the stage again (it would come in once more).
 */
export function patchChrome(root, { overview, hero = null }) {
  const holder = root?.querySelector("#trn-chrome");
  if (!holder) {
    return;
  }
  const summary = summarise(overview);
  for (const [value, , id] of figuresOf(summary)) {
    const node = id ? holder.querySelector(`#${id}`) : null;
    if (node) {
      node.textContent = String(value);
    }
  }
  for (const zone of ZONES) {
    const tab = holder.querySelector(`.trn-tab[data-zone="${zone}"]`);
    if (!tab) {
      continue;
    }
    const { line, share } = entryInfo(zone, summary);
    tab.querySelector(".trn-tab__line").innerHTML = line;
    const bar = tab.querySelector(".trn-tab__bar i");
    if (bar && share !== null) {
      bar.dataset.p = String(share);
      bar.style.setProperty("--p", String(share));
    }
  }
  const slot = holder.querySelector(".cm-stage__art");
  if (hero && slot && slot.dataset.art !== hero.id) {
    slot.dataset.art = hero.id;
    slot.dataset.drawn = "";
    slot.innerHTML = "";
    slot.classList.remove("is-on");
    fillSceneArt(slot, hero);
  }
}
