// What the pages of the community (teams, agenda, inbox, find a scrim, players, Discord, reports) have in
// common: the stage that opens them (the 16:9 cover of a hero under a dark veil, the title, the actions and
// the big numbers), the plain-words steps and the one-line empty state. The look is in
// styles/pages/community.css (classes cm-*).
import { icon } from "../../../shared/icons.js";
import { escapeHtml } from "../../lib/dom.js";
import { t } from "../../app/browser-i18n.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { skeleton } from "../../lib/skeleton.js";
import { zoneName } from "./community-shared.js";

/** The hero whose cover opens a page; `offset` makes one page differ from another (and a day from the next). */
export const stageHero = (offset = 0) => sceneHero(offset);

/** The big numbers of a stage: [value, label, id?] triples; an id lets the number be filled in later. */
const figuresHtml = figures =>
  `<ul class="cm-figures">${figures
    .map(
      ([value, label, id]) =>
        `<li><b${id ? ` id="${id}"` : ""}>${value}</b><span>${label}</span></li>`
    )
    .join("")}</ul>`;

/**
 * The stage. `title`, `text`, `lead` (a line above the title) and `actions` are markup that is already
 * escaped; `cls` adds the classes of the page; `badge` is a picture that stands before the title (the mark of
 * a team, the avatar of a player).
 */
export function stageHtml({
  cls = "",
  hero,
  lead = "",
  badge = "",
  title,
  text = "",
  actions = "",
  figures = []
}) {
  return `<header class="page-head cm-stage keep-dark card--feature rise ${cls}">${sceneArtSlot("cm-stage__art", hero)}<div class="cm-stage__veil" aria-hidden="true"></div><div class="cm-stage__who">${badge ? `<span class="cm-stage__badge">${badge}</span>` : ""}<div class="cm-stage__main">${lead}<h1>${title}</h1>${text ? `<p>${text}</p>` : ""}${actions ? `<div class="cm-stage__actions">${actions}</div>` : ""}</div></div>${figures.length ? figuresHtml(figures) : ""}</header>`;
}

/** Draws the cover into the stage of `root` (nothing when the hero has none: the stage keeps its gradient). */
export const paintStage = (root, hero) => fillSceneArt(root.querySelector(".cm-stage__art"), hero);

/**
 * The page of a community view BEFORE its data: its stage (the title, the introduction, the actions that do not depend
 * on the person, the figures still to come) and a skeleton under it. The page paints it first (`root.paintFrame`) and the
 * server draws the same for a person who is signed in (platform/http/prerender.js), so the heading is on the screen at
 * the first paint. src/client/frames.e2e.mjs keeps it in step with the stage each page draws once it has its data.
 */
export function communityFrame(view) {
  const specs = {
    inbox: {
      cls: "ib-stage",
      hero: 7,
      title: t("Inbox & notifications"),
      text: t("Scrim requests, answers and invitations, in one place."),
      actions: `<a class="btn btn--primary" href="/find">${icon("search")}${t("Find a scrim")}</a><a class="btn" href="/agenda">${icon("calendar")}${t("Agenda")}</a>`,
      figures: [[t("Your turn")], [t("Requests")], [t("Unread")]]
    },
    agenda: {
      cls: "ag-stage",
      hero: 9,
      title: t("Agenda"),
      // a getter: this table is rebuilt for every view, and the first look at the time zone costs about 50 ms on a phone
      get text() {
        return t("The agenda of your teams, in your time zone ({zone}).", {
          zone: escapeHtml(zoneName())
        });
      },
      actions: `<a class="btn btn--lg" href="/teams">${icon("users")}${t("Teams")}</a>`,
      figures: [
        [t("Next 7 days"), "fig-week"],
        [t("To answer"), "fig-answer"],
        [t("Teams"), "fig-teams"]
      ]
    },
    discord: {
      cls: "dc-stage",
      hero: 10,
      title: t("Discord & onboarding"),
      text: t("Link your Discord to get scrim requests, reminders and results as direct messages."),
      actions: `<a class="btn btn--primary btn--lg" href="/inbox">${icon("mail")}${t("Inbox & notifications")}</a>`,
      figures: [[t("Getting started")], [t("Notifications")], [t("Team servers")]]
    },
    find: {
      cls: "fd-stage",
      hero: 6,
      title: t("Find a scrim"),
      text: t("Search open announcements and teams that match your level, time zone and format."),
      actions: `<button type="button" class="btn btn--primary btn--lg" data-community="open-post-form">${icon("plus")}${t("Post “Looking for scrim”")}</button><a class="btn btn--lg" href="/teams">${icon("users")}${t("Teams")}</a>`,
      figures: [
        [t("Open announcements"), "fig-open"],
        [t("Teams"), "fig-teams"],
        [t("Regions"), "fig-regions"]
      ]
    },
    reports: {
      cls: "rp-stage",
      hero: 11,
      title: t("Reports"),
      text: t("Conversations reported by the community."),
      figures: [[t("Reports")], [t("Teams")], [t("Messages")]]
    }
  };
  const spec = specs[view];
  if (!spec) {
    return null;
  }
  const hero = stageHero(spec.hero);
  return {
    hero,
    html: `${stageHtml({
      cls: spec.cls,
      hero,
      title: spec.title,
      text: spec.text,
      actions: spec.actions,
      figures: spec.figures.map(([label, id]) => ["–", label, id])
    })}${skeleton("page")}`
  };
}

/** Writes a number into a figure of the stage, when it is on the screen. */
export function setFigure(root, id, value) {
  const node = root.querySelector(`#${id}`);
  if (node) {
    node.textContent = String(value);
  }
}

/** Numbered steps with a picture each ("How it works"): [icon, title, text] triples, already translated. */
export function stepsHtml(steps, className = "") {
  return `<ol class="cm-steps ${className}">${steps
    .map(
      ([name, title, text], index) =>
        `<li><span class="cm-steps__icon">${icon(name, "i--lg")}<i>${index + 1}</i></span><b>${title}</b><span>${text}</span></li>`
    )
    .join("")}</ol>`;
}

/**
 * An empty list is one line with its action, never a block: an icon, a title and a sentence, and maybe a
 * button. `tag` is "p" for a line inside a list, "div" elsewhere; `className` adds hooks (the tests look
 * for `empty`).
 */
export function lineHtml(iconName, title, text = "", action = "", className = "empty") {
  return `<p class="${className} cm-line">${icon(iconName, "i--sm")}<span><b>${title}</b>${text ? ` ${text}` : ""}</span>${action}</p>`;
}

/** The person asked for less motion (the system setting, or the one of the site). */
export const calm = () =>
  document.documentElement.classList.contains("reduce-motion") ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The three moves of a scrim, for the pages that explain them (Find a scrim, the empty inbox). */
export const scrimStepsHtml = () =>
  stepsHtml([
    [
      "flag",
      t("Post or pick"),
      t("Publish your free slot, or ask a team that already posted one.")
    ],
    ["chat", t("Agree"), t("The other team accepts, or proposes another time, in your inbox.")],
    ["swords", t("Play"), t("The scrim lands in the agenda; the series is one click away.")]
  ]);

/** What the agenda gives, for the person who has no team yet and for the visitor. */
export const agendaStepsHtml = () =>
  stepsHtml([
    ["users", t("Join a team"), t("Your agenda shows the events of your teams.")],
    ["calendar", t("Plan"), t("Scrims, practice, VOD reviews and matches, in your time zone.")],
    [
      "bell",
      t("Answer"),
      t("Say if you come in one click; Discord reminds the players 6 h, 4 h and 2 h before.")
    ]
  ]);
