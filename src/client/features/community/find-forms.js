// The two forms: asking a team for a scrim, and publishing an announcement.
import {
  CONTROLS,
  FORMATS,
  HERO_RULES,
  controlLabel,
  localInput,
  options,
  ruleLabel,
  zoneName
} from "./community-shared.js";
import { calm, lineHtml } from "./stage.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

/** A choice among a few values, as chips that behave like radio buttons ("Any" first). */
export const chips = (name, values, label) =>
  [["", t("Any")], ...values.map(value => [String(value), label(value)])]
    .map(
      ([value, text], index) =>
        `<label class="cm-chip"><input type="radio" name="${name}" value="${esc(value)}"${index === 0 ? " checked" : ""}><span>${esc(text)}</span></label>`
    )
    .join("");

// ---- the two forms ----------------------------------------------------------------------------
export function composerForm(view, { toTeam, post = null }) {
  const start = post
    ? Math.max(post.startsAt, Date.now() + 3600_000)
    : Math.ceil(Date.now() / 1800000) * 1800000 + 86400000;
  const end = post ? Math.min(post.endsAt, start + 3 * 3600_000) : start + 2 * 3600_000;
  const teams = view.ctx
    .staffTeams()
    .filter(team => team.id !== toTeam.id)
    .map(team => `<option value="${esc(team.id)}">${esc(team.name)}</option>`)
    .join("");
  return `<form id="request-form" class="card card--feature fd-composer rise" data-to="${esc(toTeam.id)}" data-post="${esc(post?.id ?? "")}" novalidate>
      <div class="card__head"><h2>${t("Request a scrim from {team}", { team: esc(toTeam.name) })}</h2></div>
      <div class="fd-composer__grid">
        <label class="label">${t("Your team")}<span class="field"><select id="rq-from" name="fromTeamId">${teams}</select></span></label>
        <label class="label">${t("Format")}<span class="field"><select id="rq-format" name="format">${options(FORMATS, post?.format ?? 3, value => `BO${value}`)}</select></span></label>
        <label class="label">${t("Hero rule")}<span class="field"><select id="rq-rule" name="heroRule">${options(HERO_RULES, post?.heroRule ?? "global-ban-pick", ruleLabel)}</select></span></label>
        <label class="label">${t("Draft control")}<span class="field"><select id="rq-control" name="control">${options(CONTROLS, post?.control ?? "online", controlLabel)}</select></span></label>
        <label class="label">${t("Start")}<span class="field"><input id="rq-start" name="start" type="datetime-local" required value="${localInput(start)}"></span></label>
        <label class="label">${t("End")}<span class="field"><input id="rq-end" name="end" type="datetime-local" required value="${localInput(end)}"></span></label>
      </div>
      <label class="label">${t("Message")}<span class="field field--area"><textarea id="rq-note" name="note" rows="2" maxlength="400"></textarea></span><small>${t("Times are shown in your time zone ({zone}).", { zone: esc(zoneName()) })}</small></label>
      <p class="form-error" id="rq-error" role="alert"></p>
      <div class="hstack wrap"><button class="btn btn--primary" type="submit">${icon("send")}${t("Send the request")}</button><button class="btn btn--ghost" type="button" data-community="close-composer">${t("Cancel")}</button></div>
    </form>`;
}

export function openComposer(view, toTeam, post = null) {
  if (!view.ctx.signedIn()) {
    view.go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return;
  }
  if (!view.ctx.staffTeams().some(team => team.id !== toTeam.id)) {
    view.tell(
      t(
        "Only the staff and the captain of a team can ask for a scrim: create or join a team first."
      )
    );
    return;
  }
  const slot = view.ctx.root().querySelector("#composer-slot");
  slot.innerHTML = view.composerForm({ toTeam, post });
  slot.hidden = false;
  slot.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
  slot.querySelector("select")?.focus({ preventScroll: true });
}

/** The panel that publishes an announcement: the form for the staff of a team, a sentence for the others. */
export function publishPanel(view) {
  const head = `<div class="card__head"><h2>${t("Post “Looking for scrim”")}</h2></div>`;
  if (!view.ctx.signedIn()) {
    return `<section class="card card--feature fd-publish" id="fd-publish">${head}${lineHtml("lock", t("Sign in to use the community features."), "", `<a class="btn btn--primary btn--sm" href="/login?next=${encodeURIComponent(location.pathname)}">${t("Sign in")}</a>`, "cm-line")}</section>`;
  }
  const teams = view.ctx.staffTeams();
  if (!teams.length) {
    return `<section class="card card--feature fd-publish" id="fd-publish">${head}${lineHtml("users", t("Only the staff and the captain of a team can post an announcement: create or join a team first."), "", `<a class="btn btn--primary btn--sm" href="/teams">${t("Teams")}</a>`, "cm-line")}</section>`;
  }
  const start = Math.ceil(Date.now() / 1800000) * 1800000 + 86400000;
  return `<div id="fd-publish"><form id="post-form" class="card card--feature fd-publish" novalidate>
      ${head}
      <label class="label">${t("Your team")}<span class="field"><select id="pf-team" name="teamId">${teams.map(team => `<option value="${esc(team.id)}">${esc(team.name)}</option>`).join("")}</select></span></label>
      <div class="fd-pair">
        <label class="label">${t("Format")}<span class="field"><select id="pf-format" name="format">${options(FORMATS, 3, value => `BO${value}`)}</select></span></label>
        <label class="label">${t("Draft control")}<span class="field"><select id="pf-control" name="control">${options(CONTROLS, "online", controlLabel)}</select></span></label>
      </div>
      <label class="label">${t("Hero rule")}<span class="field"><select id="pf-rule" name="heroRule">${options(HERO_RULES, "global-ban-pick", ruleLabel)}</select></span></label>
      <label class="label">${t("Available from")}<span class="field"><input id="pf-start" name="start" type="datetime-local" required value="${localInput(start)}"></span></label>
      <label class="label">${t("Until")}<span class="field"><input id="pf-end" name="end" type="datetime-local" required value="${localInput(start + 3 * 3600_000)}"></span></label>
      <label class="label">${t("Note")}<span class="field"><input id="pf-note" name="note" maxlength="200" autocomplete="off"></span></label>
      <p class="form-error" id="pf-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">${icon("check")}${t("Publish")}</button>
    </form></div>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { composerForm, openComposer, publishPanel };
