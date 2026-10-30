// reports, small helpers: bubble, teamsOf, people, row, and 3 more.
import { ago, dateTimeLabel } from "./labels.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, paintStage, stageHero, stageHtml, stepsHtml } from "./stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { ruleLabel } from "./community-shared.js";
import { teamEmblem } from "../../domain/team-emblem.js";

export const bubble = item =>
  `<div class="bubble"><div><div class="bubble__text">${esc(item.text)}</div><small>${esc(item.author.name)} #${esc(item.author.tag)} · ${esc(ago(item.at))}</small></div></div>`;

export const teamsOf = report => (report.teams.length ? report.teams : [report.reason]);

export const people = report =>
  `<span class="rp-teams">${teamsOf(report)
    .map(name => `<span class="rp-team">${teamEmblem(name, 32)}<b>${esc(name)}</b></span>`)
    .join(`<i aria-hidden="true">↔</i>`)}</span>`;

export const row = (
  view,
  report
) => `<tr class="report-card rp-row${report.id === view.selected ? " on" : ""}" data-community="select-report" data-id="${esc(report.id)}">
      <td><button type="button" class="rp-pick" data-community="select-report" data-id="${esc(report.id)}" aria-pressed="${report.id === view.selected}">${people(report)}</button></td>
      <td><span class="pill pill--red">${esc(report.reason)}</span></td>
      <td>${esc(report.reporter.name)} <small class="faint">#${esc(report.reporter.tag)}</small></td>
      <td>${esc(dateTimeLabel(report.at))}</td>
      <td class="r" data-label="${t("Messages")}">${report.messages.length}</td>
    </tr>`;

/** The messages of the contact page: who wrote, what, and the two things an administrator does with it. */
export const contactCard = view => {
  const message = item => `<article class="rp-msg${item.handledAt ? " is-done" : ""}">
      <header><b>${esc(item.subject)}</b><small>${esc(item.name)} · <a href="mailto:${esc(item.email)}">${esc(item.email)}</a> · ${esc(dateTimeLabel(item.createdAt))}${item.signedIn ? ` · ${t("signed in")}` : ""}</small></header>
      <p>${esc(item.message)}</p>
      <footer><button type="button" class="btn btn--sm" data-community="contact-handled" data-id="${esc(item.id)}" data-handled="${item.handledAt ? "0" : "1"}">${icon("check", "i--sm")}${item.handledAt ? t("Mark as not handled") : t("Mark as handled")}</button><button type="button" class="btn btn--ghost btn--sm" data-community="contact-delete" data-id="${esc(item.id)}">${icon("trash", "i--sm")}${t("Delete")}</button></footer>
    </article>`;
  return `<section class="card rp-contact rise d-2" aria-labelledby="rp-contact-title"><div class="card__head"><h2 id="rp-contact-title">${t("Messages from the contact page")}</h2><span class="count">${number(view.contact.open)}</span></div>${view.contact.items.length ? `<div class="rp-msgs">${view.contact.items.map(message).join("")}</div>` : `<p class="muted">${t("No message yet.")}</p>`}</section>`;
};

export function detail(view) {
  const report = view.items.find(item => item.id === view.selected);
  if (!report) {
    return "";
  }
  return `<div class="card__head"><h2>${t("Report")}</h2><span class="pill pill--red">${esc(report.reason)}</span></div>
      <div class="rp-detail__who">${people(report)}<small class="muted">${t("Reported by {name}", { name: `${esc(report.reporter.name)} #${esc(report.reporter.tag)}` })} · ${esc(dateTimeLabel(report.at))}</small></div>
      <div class="thread-view" aria-label="${t("Conversation")}">${report.messages.length ? report.messages.map(bubble).join("") : `<p class="muted">${t("No text message in this conversation.")}</p>`}</div>
      <button type="button" class="btn btn--primary" data-community="dismiss-report" data-id="${esc(report.id)}">${icon("check")}${t("Dismiss the report")}</button>`;
}

export async function show(view) {
  const root = view.ctx.root();
  const hero = stageHero(11);
  if (!view.state.auth.user?.isAdmin) {
    root.innerHTML = `${stageHtml({ cls: "rp-stage", hero, title: t("Reports"), text: t("Conversations reported by the community.") })}${lineHtml("lock", t("This page is for administrators."))}`;
    paintStage(root, hero);
    return;
  }
  const [reports, messages, posts] = await Promise.all([
    view.api("/api/admin/reports"),
    view.api("/api/admin/contact?pageSize=50").catch(() => ({ items: [], open: 0 })),
    view
      .api("/api/scrim-posts?pageSize=6")
      .then(data => data.items)
      .catch(() => [])
  ]);
  view.items = reports.items;
  view.contact = messages;
  if (!view.items.some(item => item.id === view.selected)) {
    view.selected = view.items[0]?.id ?? null;
  }
  const teams = new Set(view.items.flatMap(report => report.teams));
  root.innerHTML = `${stageHtml({
    cls: "rp-stage",
    hero,
    title: t("Reports"),
    text: t("Conversations reported by the community."),
    figures: [
      [number(view.items.length), t("Reports")],
      [number(teams.size), t("Teams")],
      [number(view.items.reduce((sum, report) => sum + report.messages.length, 0)), t("Messages")]
    ]
  })}${
    view.items.length
      ? `<div class="cm-layout cm-layout--side rp-layout rise d-1">
            <section class="card card--flush rp-list" aria-label="${t("Reports")}"><div class="table-scroll"><table class="table table--boxed rp-table"><thead><tr><th>${t("Teams")}</th><th>${t("Reason")}</th><th>${t("Reporter")}</th><th>${t("When")}</th><th class="r">${t("Messages")}</th></tr></thead><tbody>${view.items.map(view.row).join("")}</tbody></table></div></section>
            <aside class="cm-side"><section class="card rp-detail" id="report-detail">${view.detail()}</section></aside>
          </div>`
      : `${lineHtml("check", t("No report"), t("Reported conversations appear here."))}
          <div class="cm-layout cm-layout--side rp-empty"><section class="fd-how rp-how" aria-labelledby="rp-how-title"><h2 id="rp-how-title">${t("How reports work")}</h2>${stepsHtml(
            [
              [
                "flag",
                t("Report"),
                t("A player reports a conversation from the inbox, with a reason.")
              ],
              [
                "chat",
                t("Read"),
                t("The conversation appears here, with who reported it and when.")
              ],
              ["check", t("Decide"), t("Dismiss the report once it is handled.")]
            ]
          )}</section>${
            posts.length
              ? `<aside class="cm-side"><section class="card"><div class="card__head"><h2>${t("Looking for a scrim")}</h2><span class="count">${posts.length}</span></div><div class="list">${posts
                  .map(
                    post =>
                      `<a class="row link-row" href="/teams/${encodeURIComponent(post.team.id)}">${teamEmblem(post.team, 40)}<span class="row__body"><b>${esc(post.team.name)}</b><small>${esc(post.note || ruleLabel(post.heroRule))}</small></span></a>`
                  )
                  .join("")}</div></section></aside>`
              : ""
          }</div>`
  }${view.contactCard()}`;
  paintStage(root, hero);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { row, contactCard, detail, show };
