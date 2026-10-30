// Small pieces of the inbox: the rows of the three lists and their counts.
import { ago, dateTimeLabel, roleLabel } from "./labels.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { laneLabel } from "../../domain/lanes.js";
import { notificationIcon, notificationLink, notificationText } from "./notifications.js";
import { statusLabel } from "./community-shared.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";

export const otherOf = request => (request.mySide === "from" ? request.to : request.from);

export const waiting = view => view.requests.filter(request => request.awaitingMe).length;

export const unread = view => view.notifications.filter(item => !item.read).length;

export const wide = () => matchMedia("(min-width: 901px)").matches;

/** What each filter counts: what needs the person (a turn to play, an unread notification, an invitation). */
export const counts = view => ({
  all: view.waiting() + view.unread() + view.invitations.length,
  requests: view.requests.length,
  notifications: view.unread(),
  invitations: view.invitations.length
});

// ---- the lists ----------------------------------------------------------------------------------
export const threadRow = (view, request) => {
  const other = otherOf(request);
  return `<button type="button" class="th${view.selected === request.id ? " on" : ""}" data-community="open-request" data-id="${esc(request.id)}">
      ${teamEmblem(other, 44)}
      <span class="grow"><b>${esc(other.name)}<small>${esc(ago(request.updatedAt))}</small></b><p>BO${request.format} · ${esc(dateTimeLabel(request.startsAt))} · ${request.awaitingMe ? t("Your turn") : esc(statusLabel(request.status))}</p></span>
      ${request.awaitingMe ? `<i class="unread" title="${t("Your turn")}"></i>` : ""}
    </button>`;
};

/** A notification: it opens the request it is about, or goes where it leads. */
export const notificationRow = (view, item) => {
  const body = `<span class="ico">${icon(notificationIcon(item.kind))}</span><span><p>${notificationText(item)}</p><small>${esc(ago(item.at))}</small></span>`;
  const requestId = item.payload?.requestId;
  return requestId && view.requests.some(request => request.id === requestId)
    ? `<button type="button" class="notif${item.read ? "" : " unread"}" data-community="open-request" data-id="${esc(requestId)}">${body}</button>`
    : `<a class="notif${item.read ? "" : " unread"}" href="${notificationLink(item)}">${body}</a>`;
};

export const invitationRow = invitation => `<div class="ib-inv">
      ${teamEmblem(invitation.team, 44)}
      <span class="grow"><b>${esc(invitation.team.name)}</b><p>${esc(roleLabel(invitation.role))}${invitation.lane ? ` · ${esc(laneLabel(invitation.lane))}` : ""} · ${esc(invitation.invitedBy.name)} #${esc(invitation.invitedBy.tag)}</p></span>
      <span class="hstack"><button type="button" class="btn btn--sm btn--ghost" data-community="invite-answer" data-choice="decline" data-id="${esc(invitation.id)}">${t("Decline")}</button><button type="button" class="btn btn--sm btn--primary" data-community="invite-answer" data-choice="accept" data-id="${esc(invitation.id)}">${t("Accept")}</button></span>
    </div>`;

/** What fills an empty list: the teams that look for a scrim right now (they are one click from a request). */
export const suggestionsHtml = view =>
  view.suggestions.length
    ? `<h3 class="subheading">${t("Looking for a scrim")}</h3><div class="ib-sug">${view.suggestions
        .map(
          post =>
            `<a class="ib-sug__row" href="/find">${teamEmblem(post.team, 44)}<span class="grow"><b>${esc(post.team.name)}</b><p>BO${post.format} · ${esc(dateTimeLabel(post.startsAt))}</p></span>${icon("right", "i--sm")}</a>`
        )
        .join("")}</div>`
    : "";

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { waiting, unread, counts, threadRow, notificationRow, suggestionsHtml };
