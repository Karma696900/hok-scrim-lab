// The filters on the left and the list in the middle.
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml } from "./stage.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { invitationRow, otherOf } from "./inbox-parts.js";

export function drawRail(view) {
  const root = view.ctx.root();
  const count = view.counts();
  const tabs = [
    ["all", "list", t("All")],
    ["requests", "swords", t("Requests")],
    ["notifications", "bell", t("Notifications")],
    ["invitations", "users", t("Invitations")]
  ];
  root.querySelector("#ib-rail-list").innerHTML = tabs
    .map(
      ([id, iconName, label]) =>
        `<button type="button" role="tab" aria-selected="${id === view.tab}" class="${id === view.tab ? "on" : ""}" data-community="inbox-tab" data-tab="${id}">${icon(iconName, "i--sm")}<span>${label}</span>${count[id] ? `<em class="count">${count[id]}</em>` : ""}</button>`
    )
    .join("");
  const teams = view.ctx.myTeams();
  root.querySelector("#ib-teams").innerHTML = teams.length
    ? `<div class="cm-group"><h2>${t("Your teams")}</h2><div class="ib-teams__list">${[
        ["", t("All teams"), null],
        ...teams.map(team => [team.id, team.name, team])
      ]
        .map(
          ([id, name, team]) =>
            `<button type="button" class="${id === view.teamFilter ? "on" : ""}" data-community="inbox-team" data-id="${esc(id)}" aria-pressed="${id === view.teamFilter}">${team ? teamEmblem(team, 24) : icon("users", "i--sm")}<span>${esc(name)}</span></button>`
        )
        .join("")}</div></div>`
    : "";
}

export function drawList(view) {
  const root = view.ctx.root();
  const list = root.querySelector("#thread-list");
  const needle = (root.querySelector("#inbox-search")?.value ?? "").trim().toLocaleLowerCase();
  const entries = [];
  if (view.tab === "all" || view.tab === "requests") {
    for (const request of view.requests) {
      if (
        (!view.teamFilter ||
          request.from.id === view.teamFilter ||
          request.to.id === view.teamFilter) &&
        (!needle || otherOf(request).name.toLocaleLowerCase().includes(needle))
      ) {
        entries.push([request.updatedAt, view.threadRow(request)]);
      }
    }
  }
  if (view.tab === "all" || view.tab === "invitations") {
    for (const invitation of view.invitations) {
      if (!needle || invitation.team.name.toLocaleLowerCase().includes(needle)) {
        entries.push([invitation.createdAt, invitationRow(invitation)]);
      }
    }
  }
  if (view.tab === "all" || view.tab === "notifications") {
    for (const item of view.notifications) {
      if (view.tab === "notifications" || !item.read) {
        entries.push([item.at, view.notificationRow(item)]);
      }
    }
  }
  entries.sort((left, right) => right[0] - left[0]);
  const empty = {
    requests: lineHtml(
      "mail",
      t("No request yet"),
      t("Requests you send or receive appear here."),
      `<a class="btn btn--primary btn--sm" href="/find">${t("Find a scrim")}</a>`
    ),
    notifications: lineHtml("bell", t("Nothing yet.")),
    invitations: lineHtml("users", t("Nobody is waiting for an answer.")),
    all: lineHtml(
      "mail",
      t("No request yet"),
      t("Requests you send or receive appear here."),
      `<a class="btn btn--primary btn--sm" href="/find">${t("Find a scrim")}</a>`
    )
  }[view.tab];
  list.innerHTML = entries.length
    ? entries.map(([, html]) => html).join("")
    : needle
      ? lineHtml("search", t("No matches"))
      : empty + (["all", "requests"].includes(view.tab) ? view.suggestionsHtml() : "");
  const head = root.querySelector("#ib-listtop-action");
  head.innerHTML =
    view.unread() && view.tab !== "requests" && view.tab !== "invitations"
      ? `<button type="button" class="btn btn--sm" data-community="read-all">${icon("check", "i--sm")}${t("Mark all as read")}</button>`
      : "";
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { drawRail, drawList };
