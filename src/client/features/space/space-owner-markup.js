// space page (owner), page owner: stage, linkRow, shareBand, paint.
import { daysText } from "../../domain/reflex-labels.js";
import { formatDate } from "../../lib/format.js";
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { paintCovers } from "./space-columns.js";
import { sectionLabel } from "./space-page-shared.js";
import { stageHtml } from "../community/stage.js";
import { shareIntro } from "./space-owner-shared.js";

// The stage comes first, with what it will say still to come, and a skeleton under it: the page has its title and
// its introduction at once, the body fills in when the data is there (the server draws exactly this first, for a
// person who is signed in: platform/http/prerender.js, "frame").
export const stage = (page, figures) =>
  stageHtml({
    cls: "sp-stage",
    hero: page.hero,
    title: t("My space"),
    text: t(
      "What you keep on the site: your tier lists, your builds and your training sheet. Share all of it, or only what you choose, with one link."
    ),
    actions: `<button type="button" class="btn btn--primary btn--lg" data-sp-jump>${icon("link")}${t("Share my space")}</button>`,
    figures
  });

export const linkRow = (page, link) => {
  const ends =
    link.expiresAt === null
      ? t("Does not end")
      : t("Ends on {date}", { date: formatDate(link.expiresAt) });
  const opened = link.openedCount
    ? t("{count, plural, one {Opened # time} other {Opened # times}}", {
        count: link.openedCount
      })
    : t("Never opened");
  return `<li class="sp-link"><div class="grow"><b>${page.view.esc(link.label || t("Link of {date}", { date: formatDate(link.createdAt) }))}</b><span class="sp-link__parts">${link.sections.map(section => `<span class="pill pill--grey">${page.view.esc(sectionLabel(section))}</span>`).join("")}</span><small>${page.view.esc(ends)} · ${page.view.esc(opened)}</small></div><button type="button" class="btn btn--ghost btn--sm" data-sp-remove-link="${page.view.esc(link.id)}">${icon("trash", "i--sm")}${t("Remove the link")}</button></li>`;
};

export function shareBand(page) {
  return `<section class="card card--feature sp-share" id="sp-share">
        <div class="sp-share__make">
          <div class="card__head"><h2>${t("Share my space")}</h2><span class="pill pill--grey">${t("{count} of {max} links", { count: page.space.links.length, max: page.space.limits.links })}</span></div>
          ${shareIntro()}
          <form id="sp-link-form" class="form-grid" novalidate>
            <div class="label full">${t("The link shares")}<div class="chip-checks">${SECTIONS.map(section => `<label class="chip-check"><input type="checkbox" name="sections" value="${section}" checked><span>${page.view.esc(sectionLabel(section))}</span></label>`).join("")}</div></div>
            <label class="label">${t("Name of the link (optional)")}<span class="field"><input name="label" maxlength="60" autocomplete="off" placeholder="${t("For my coach")}"></span></label>
            <label class="label">${t("The link lasts")}<span class="field"><select name="days"><option value="">${t("Until I remove it")}</option>${page.space.limits.days.map(days => `<option value="${days}">${page.view.esc(daysText(days))}</option>`).join("")}</select></span></label>
            <p class="form-error full" id="sp-error" role="alert"></p>
            <div class="full"><button class="btn btn--primary" type="submit">${icon("link", "i--sm")}${t("Create the link")}</button></div>
          </form>
          <div id="sp-fresh">${
            page.fresh
              ? `<div class="note note--info sp-fresh">${icon("info", "i--sm")}<div><b>${t("Your new link")}</b><p>${t("It is shown only once: copy it now. Anybody who has it sees what it shares.")}</p><div class="sp-copy"><label class="field"><input id="sp-fresh-address" readonly value="${page.view.esc(page.fresh)}" aria-label="${t("Address of the link")}"></label><button type="button" class="btn btn--primary btn--sm" data-sp-copy>${icon("copy", "i--sm")}${t("Copy the link")}</button></div></div></div>`
              : ""
          }</div>
        </div>
        <div class="sp-share__links">
          <h3 class="subheading">${t("Your links")}</h3>
          ${
            page.space.links.length
              ? `<ul class="sp-links">${page.space.links.map(page.linkRow).join("")}</ul>`
              : `<p class="muted">${t("No link yet: nobody can see your space.")}</p>`
          }
        </div>
      </section>`;
}

export function paint(page) {
  page.root.innerHTML = `<div class="sp-page${page.settled ? " is-settled" : ""}">${page.stage([
    [number(page.space.tierLists.length), t("Tier lists")],
    [number(page.space.builds.length), t("Builds")],
    [number(page.space.training.focus.length), t("Heroes worked on")]
  ])}
        <div class="sp-body">${page.shareBand()}${page.view.sections(page.space, SECTIONS, { owner: true })}</div></div>`;
  paintCovers(page.root, page.hero);
  page.settled = true;
}

const SECTIONS = ["tierLists", "builds", "training"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { stage, linkRow, shareBand, paint };
