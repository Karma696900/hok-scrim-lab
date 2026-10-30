// The side: the announcements and the requests of the person, the directory.
import { dateTimeLabel } from "./labels.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { levelLabel, ruleLabel, slotText, statusLabel, statusTone } from "./community-shared.js";
import { lineHtml, setFigure } from "./stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { teamEmblem, teamHue } from "../../domain/team-emblem.js";

// ---- the side: the announcements and the requests of the person, the directory ------------------
export const mini = (mark, title, text, tail) =>
  `${mark}<span class="fd-mini__text"><b>${esc(title)}</b><small>${text}</small></span>${tail}`;

/** The teams that could be asked, in the middle of the page under the list: a card each, with the way to ask. */
export const directoryBlock = view =>
  `<section class="card fd-dir" aria-labelledby="fd-dir-title"><div class="card__head"><h2 id="fd-dir-title">${t("Team directory")}</h2><a class="link" href="/teams">${t("Browse all teams")} →</a></div>${
    view.directory.length
      ? `<div class="fd-dir__grid">${view.directory
          .map(
            team =>
              `<div class="fd-team hue-${teamHue(team)}">${teamEmblem(team, 56)}<span class="fd-mini__text"><b>${esc(team.name)}</b><small>${esc(levelLabel(team.level))} · ${esc(team.region || "—")}</small></span><button type="button" class="btn btn--sm" data-community="request-team" data-id="${esc(team.id)}" data-name="${esc(team.name)}">${t("Request")}</button></div>`
          )
          .join("")}</div>`
      : lineHtml("users", t("No team found"), "", "", "cm-line")
  }</section>`;

export const sideCards = view => {
  const announcements = `<section class="card fd-side-card"><div class="card__head"><h2>${t("Your announcements")}</h2><span class="count">${view.mine.length}</span></div>${
    view.mine.length
      ? `<div class="list">${view.mine
          .map(
            post =>
              `<div class="fd-mini myann">${mini(teamEmblem(post.team, 40), post.team.name, `BO${post.format} · ${esc(ruleLabel(post.heroRule))} · ${slotText(post.startsAt, post.endsAt)}`, `<button type="button" class="btn btn--ghost btn--icon btn--sm" data-community="close-post" data-id="${esc(post.id)}" aria-label="${t("Close the announcement")}" title="${t("Close the announcement")}">${icon("x", "i--sm")}</button>`)}</div>`
          )
          .join("")}</div>`
      : lineHtml(
          "flag",
          t("No announcement matches"),
          "",
          `<button type="button" class="btn btn--sm" data-community="open-post-form">${icon("plus", "i--sm")}${t("Publish")}</button>`,
          "cm-line"
        )
  }</section>`;
  const waiting = view.requests
    .toSorted((a, b) => Number(b.awaitingMe) - Number(a.awaitingMe) || b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const requestCards = `<section class="card fd-side-card"><div class="card__head"><h2>${t("Your requests")}</h2><a class="btn btn--ghost btn--sm" href="/inbox">${t("Inbox & notifications")}</a></div>${
    waiting.length
      ? `<div class="list">${waiting
          .map(request => {
            const other = request.mySide === "from" ? request.to : request.from;
            return `<a class="fd-mini myreq" href="/inbox?open=${encodeURIComponent(request.id)}">${mini(teamEmblem(other, 40), other.name, `BO${request.format} · ${esc(dateTimeLabel(request.startsAt))}`, `<span class="pill${request.awaitingMe ? " pill--warn" : statusTone(request.status)}">${esc(request.awaitingMe ? t("Your turn") : statusLabel(request.status))}</span>`)}</a>`;
          })
          .join("")}</div>`
      : lineHtml("mail", t("Requests you send or receive appear here."), "", "", "cm-line")
  }</section>`;
  return `${view.ctx.signedIn() ? announcements + requestCards : ""}
      <div class="note">${icon("shieldcheck", "i--sm")}<span><b>${t("Signed answers")}</b>${t("On Discord, a request arrives with Accept and Decline buttons. Every click is signed by Discord and checked here, and only the staff of the team can answer.")}</span></div>`;
};

export async function loadSide(view) {
  const [teams, own, asked] = await Promise.all([
    view.api("/api/teams?pageSize=8"),
    view.ctx.signedIn() ? view.api("/api/scrim-posts?mine=1&pageSize=50") : { items: [] },
    view.ctx.signedIn() ? view.api("/api/requests") : { items: [] }
  ]);
  const root = view.ctx.root();
  view.directory = teams.items
    .filter(team => !view.ctx.myTeams().some(item => item.id === team.id))
    .slice(0, 5);
  view.mine = own.items;
  view.requests = asked.items;
  setFigure(root, "fig-teams", number(teams.total));
  root.querySelector("#fd-side-cards").innerHTML = view.sideCards();
  root.querySelector("#fd-directory").innerHTML = view.directoryBlock();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { directoryBlock, sideCards, loadSide };
