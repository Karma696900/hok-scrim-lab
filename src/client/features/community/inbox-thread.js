// A conversation: its messages, the answers, the strip with the facts of the request.
import {
  LANES,
  controlLabel,
  levelLabel,
  localInput,
  ruleLabel,
  slotText,
  statusLabel,
  statusTone,
  zoneName
} from "./community-shared.js";
import { ago, dateTimeLabel } from "./labels.js";
import { calm } from "./stage.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { laneLogos } from "../../domain/lanes.js";
import { skeleton } from "../../lib/skeleton.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { otherOf, wide } from "./inbox-parts.js";

// ---- a conversation ---------------------------------------------------------------------------
export const messageRow = (message, request) => {
  const mineTeam = request.mySide === "from" ? request.from : request.to;
  const team = message.teamId === request.from.id ? request.from : request.to;
  if (message.kind !== "text") {
    const what =
      {
        accept: t("{team} accepted the request", { team: esc(team.name) }),
        decline: t("{team} declined the request", { team: esc(team.name) }),
        cancel: t("{team} cancelled the request", { team: esc(team.name) }),
        counter: t("{team} proposes {when}", {
          team: esc(team.name),
          when: esc(dateTimeLabel(Number(message.text)))
        })
      }[message.kind] ?? message.kind;
    return `<div class="sysmsg">${what} · ${esc(ago(message.at))}</div>`;
  }
  const mine = mineTeam.id === message.teamId;
  return `<div class="bubble${mine ? " bubble--me" : ""}">${mine ? "" : teamEmblem(team, 32)}<div><div class="bubble__text">${esc(message.text)}</div><small>${esc(message.author.name)} #${esc(message.author.tag)} · ${esc(ago(message.at))}</small></div></div>`;
};

/** The answers the viewer can give to a request. */
export const answerBar = (request, other) => {
  const open = ["pending", "countered"].includes(request.status);
  const counterStart = Math.max(request.startsAt + 24 * 3600_000, Date.now() + 3600_000);
  if (request.awaitingMe) {
    return `<div class="hstack wrap" data-request="${esc(request.id)}">
          <button type="button" class="btn btn--primary" data-community="answer" data-action="accept">${icon("check")}${t("Accept")}</button>
          <button type="button" class="btn" data-community="toggle-counter" aria-expanded="false">${icon("calendar")}${t("Propose another time")}</button>
          <button type="button" class="btn btn--danger" data-community="answer" data-action="decline">${icon("x")}${t("Decline")}</button>
        </div>
        <div class="counter-fields" id="counter-fields" hidden data-request="${esc(request.id)}">
          <label class="field"><input id="counter-start" type="datetime-local" value="${localInput(counterStart)}" aria-label="${t("Start")}"></label>
          <label class="field"><input id="counter-end" type="datetime-local" value="${localInput(counterStart + (request.endsAt - request.startsAt))}" aria-label="${t("End")}"></label>
          <button type="button" class="btn btn--primary" data-community="counter">${icon("send")}${t("Send")}</button>
        </div>`;
  }
  if (open) {
    return `<div class="hstack wrap" data-request="${esc(request.id)}"><button type="button" class="btn" data-community="answer" data-action="cancel">${t("Cancel the request")}</button><span class="muted">${t("Waiting for {team}", { team: esc(other.name) })}</span></div>`;
  }
  return "";
};

/** The team on the other side: what is public about it, in one strip under its name. */
export function infoStrip(other, teamPage) {
  const lanes = teamPage ? LANES.filter(lane => teamPage.members.some(m => m.lane === lane)) : [];
  const facts = [
    other.region,
    other.timezone,
    teamPage
      ? t("{count} of {max} members", {
          count: teamPage.members.length,
          max: teamPage.maxMembers
        })
      : ""
  ].filter(Boolean);
  return `<div class="ib-info">${lanes.length ? laneLogos(lanes, 26) : ""}${facts.map(fact => `<span class="pill pill--grey">${esc(fact)}</span>`).join("")}</div>`;
}

export async function showRequest(view, id) {
  view.selected = id;
  const root = view.ctx.root();
  for (const row of root.querySelectorAll(".th")) {
    row.classList.toggle("on", row.dataset.id === id);
  }
  const app = root.querySelector("#ib-app");
  app.classList.add("has-open");
  const pane = root.querySelector("#thread-pane");
  pane.innerHTML = skeleton("list", 3);
  const request = await view.api(`/api/requests/${encodeURIComponent(id)}`);
  if (view.selected !== id) {
    return; // another request was opened meanwhile
  }
  const other = otherOf(request);
  const mineTeam = request.mySide === "from" ? request.from : request.to;
  const teamPage = await view.api(`/api/teams/${encodeURIComponent(other.id)}`).catch(() => null);
  pane.innerHTML = `<div class="chat-head">
        <button type="button" class="btn btn--ghost btn--icon ib-back" data-community="inbox-back" aria-label="${t("Back")}">${icon("left")}</button>
        ${teamEmblem(other, 56)}
        <div class="grow"><h2>${esc(other.name)}</h2><small>${esc(levelLabel(other.level))} · ${request.mySide === "from" ? t("Sent to {team}", { team: esc(other.name) }) : t("Received from {team}", { team: esc(other.name) })}</small></div>
        <span class="pill${statusTone(request.status)}">${esc(statusLabel(request.status))}</span>
        <span class="hstack tight">
          <a class="btn btn--ghost btn--icon" href="/teams/${encodeURIComponent(other.id)}" aria-label="${t("View team")}" title="${t("View team")}">${icon("shieldcheck")}</a>
          <button type="button" class="btn btn--ghost btn--icon" data-community="block" data-team="${esc(mineTeam.id)}" data-other="${esc(other.id)}" aria-label="${t("Block this team")}" title="${t("Block this team")}">${icon("ban")}</button>
          <button type="button" class="btn btn--ghost btn--icon" data-community="report" aria-label="${t("Report")}" title="${t("Report")}">${icon("flag")}</button>
        </span>
      </div>
      ${infoStrip(other, teamPage)}
      <div class="reqcard keep-dark">
        <b>${t("Request")} · BO${request.format}</b>
        <div class="rows">
          <div><small>${t("Time slot")}</small><b>${slotText(request.startsAt, request.endsAt)}</b></div>
          <div><small>${t("Format")}</small><b>BO${request.format}</b></div>
          <div><small>${t("Hero rule")}</small><b>${esc(ruleLabel(request.heroRule))}</b></div>
          <div><small>${t("Draft control")}</small><b>${esc(controlLabel(request.control))}</b></div>
        </div>
        ${request.note ? `<p class="reqnote">“${esc(request.note)}”</p>` : ""}
        <small class="signed">${t("Times are shown in your time zone ({zone}).", { zone: esc(zoneName()) })}</small>
        ${answerBar(request, other)}
      </div>
      <div class="msgs" id="messages">${request.messages.map(message => messageRow(message, request)).join("")}</div>
      <div class="composer">
        ${request.status !== "cancelled" ? `<form id="message-form"><label class="field"><input name="text" maxlength="600" placeholder="${t("Write a message…")}" aria-label="${t("Message")}" autocomplete="off"></label><button type="submit" class="btn btn--primary btn--icon" aria-label="${t("Send")}">${icon("send")}</button></form>` : ""}
        <p class="form-error" id="thread-error" role="alert"></p>
      </div>`;
  const messages = pane.querySelector("#messages");
  messages.scrollTop = messages.scrollHeight;
  if (!wide()) {
    pane.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  }
  await view.readNotificationsOf(id);
}

/** Opening a conversation reads what it was about. */
export async function readNotificationsOf(view, requestId) {
  const ids = view.notifications
    .filter(item => !item.read && item.payload?.requestId === requestId)
    .map(item => item.id);
  if (!ids.length) {
    return;
  }
  await view.api("/api/notifications/read", { method: "POST", body: { ids } }).catch(() => null);
  for (const item of view.notifications) {
    if (ids.includes(item.id)) {
      item.read = true;
    }
  }
  view.drawRail();
  view.drawList();
  window.dispatchEvent(new Event("hok:community"));
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { showRequest, readNotificationsOf };
