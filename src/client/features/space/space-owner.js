// space page, page owner: show.
import { featuredHtml, paintFeatured } from "../training/showcase.js";
import { lineHtml, paintStage, stageHero, stageHtml } from "../community/stage.js";
import { t } from "../../app/browser-i18n.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { skeleton } from "../../lib/skeleton.js";
import { explainHtml, paintCovers } from "./space-columns.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as spacePagePageOwnerPageOwner } from "./space-owner-markup.js";
import { onView as spacePagePageOwnerActions } from "./space-owner-actions.js";
import { shareIntro } from "./space-owner-shared.js";
import { canRegister } from "../../app/app-state.js";
export { shareIntro } from "./space-owner-shared.js";

export async function show(view, app) {
  const page = { view };
  bindTo(page, spacePagePageOwnerPageOwner, spacePagePageOwnerActions);
  page.root = pageRoot(app, page.view.hydration);
  page.hero = stageHero(15);
  if (!page.view.state.auth.user) {
    page.root.innerHTML = `${stageHtml({
      hero: page.hero,
      title: t("My space"),
      text: t(
        "Sign in to keep your builds, your tier lists and your training sheet, and to share them with a link."
      ),
      figures: []
    })}<div class="sp-visitor">${lineHtml(
      "lock",
      t("My space"),
      t(
        "Sign in to keep your builds, your tier lists and your training sheet, and to share them with a link."
      ),
      `<span class="hstack"><a class="btn btn--primary btn--sm" href="/login?next=%2Fspace">${t("Sign in")}</a>${canRegister() ? `<a class="btn btn--sm" href="/register">${t("Create account")}</a>` : ""}</span>`,
      "empty sign-in-prompt"
    )}${explainHtml()}${featuredHtml(page.view.esc)}</div>`;
    paintStage(page.root, page.hero);
    paintFeatured(page.root);
    return;
  }

  // the first line of the share band says the same to everybody: it is in the frame too, so that the largest text of the
  // page is on the screen with the first paint instead of when the data arrives (the same node, see shareIntro)
  page.root.paintFrame(
    `<div class="sp-page">${page.stage([
      ["–", t("Tier lists")],
      ["–", t("Builds")],
      ["–", t("Heroes worked on")]
    ])}<div class="sp-body"><section class="card card--feature sp-share" id="sp-share"><div class="sp-share__make"><div class="card__head"><h2>${t("Share my space")}</h2></div>${shareIntro()}</div></section>${skeleton("grid", 3)}</div></div>`
  );
  paintCovers(page.root, page.hero);
  await page.view.loadCatalog();
  page.space = await page.view.api("/api/space");
  page.fresh = null; // the link that was just given: its address is shown once

  // the body comes in once (the frame's stage is the same node, it does not come in again): what is drawn again
  // after a change (a link given, a build removed) stays put
  page.settled = false;

  page.root.onsubmit = page.onSubmit;

  page.root.onclick = page.onClick;
  page.root.onchange = page.root.oninput = null;
  page.paint();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
