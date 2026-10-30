// space page, small helpers: heroOf, heroName, portrait, showShared.
import { avatarMarkup } from "../auth/auth-avatar.js";
import { dataUnavailable } from "../../lib/dom.js";
import { featuredHtml, paintFeatured } from "../training/showcase.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, paintStage, stageHero, stageHtml } from "../community/stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { responsive } from "../../../shared/media.js";
import { skeleton } from "../../lib/skeleton.js";
import { explainHtml } from "./space-columns.js";
import { canRegister } from "../../app/app-state.js";

export const heroOf = (view, id) => view.state.heroes.find(hero => hero.id === id);

export const heroName = (view, id) => {
  const hero = view.heroOf(id);
  return hero ? hero.displayName || hero.name : id;
};

export const portrait = (view, id, size = 40) => {
  const hero = view.heroOf(id);
  return hero?.image
    ? `<img ${responsive(hero.image, size)} alt="${view.esc(view.heroName(id))}" title="${view.esc(view.heroName(id))}" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="image-fallback" role="img" aria-label="${view.esc(view.heroName(id))}"></span>`;
};

// ---- the page a link opens ------------------------------------------------------------------------------
export async function showShared(view, app) {
  const root = pageRoot(app, view.hydration);
  root.onclick = root.onsubmit = root.onchange = root.oninput = null;
  const hero = stageHero(16);
  const token = location.hash.slice(1);
  const gone = message => {
    root.innerHTML = `${stageHtml({ cls: "cm-stage--slim", hero, title: t("Shared space"), text: "" })}${lineHtml("lock", t("This space is not available"), view.esc(message), `<a class="btn btn--sm" href="/">${t("Back to the site")}</a>`)}<div class="sp-visitor">${explainHtml()}${featuredHtml(view.esc)}</div>`;
    paintStage(root, hero);
    paintFeatured(root);
  };
  if (!token) {
    return gone(t("This address has no link in it. Ask the person for the whole link."));
  }
  // the stage and a skeleton at once, before the space is opened (the server draws exactly this first: "frame")
  const lead = t(
    "Shared with you through a link. You see it as it is now, and nothing here can be changed."
  );
  root.paintFrame(
    `${stageHtml({
      cls: "sp-stage",
      hero,
      title: t("Shared space"),
      text: lead,
      actions: `<span class="sp-readonly">${icon("lock", "i--sm")}${t("Read only")}</span>`
    })}<div class="sp-body">${skeleton("grid", 3)}</div>`
  );
  paintStage(root, hero);
  let content;
  try {
    [content] = await Promise.all([
      view.api("/api/space/open", { method: "POST", body: { token } }),
      view.loadCatalog()
    ]);
  } catch (error) {
    return gone(error.message);
  }
  const { owner } = content;
  const shown = content.sections;
  const count = {
    tierLists: content.tierLists?.length ?? 0,
    builds: content.builds?.length ?? 0,
    heroes: content.training?.focus.length ?? 0
  };
  root.innerHTML = `${stageHtml({
    cls: "sp-stage",
    hero,
    title: `<span class="sp-owner">${avatarMarkup(owner, 56)}<span>${t("Space of {name}", { name: view.esc(owner.name) })}</span></span>`,
    text: lead,
    actions: `<span class="sp-readonly">${icon("lock", "i--sm")}${t("Read only")}</span>`,
    figures: [
      shown.includes("tierLists") ? [number(count.tierLists), t("Tier lists")] : null,
      shown.includes("builds") ? [number(count.builds), t("Builds")] : null,
      shown.includes("training") ? [number(count.heroes), t("Heroes worked on")] : null
    ].filter(Boolean)
  })}
      <div class="sp-body">${view.sections(content, shown, { owner: false }) || dataUnavailable(t("Nothing is shared."))}${
        view.state.auth.user
          ? ""
          : lineHtml(
              "user",
              t("My space"),
              t(
                "Sign in to keep your builds, your tier lists and your training sheet, and to share them with a link."
              ),
              canRegister()
                ? `<span class="hstack"><a class="btn btn--primary btn--sm" href="/register">${t("Create account")}</a><a class="btn btn--sm" href="/login">${t("Sign in")}</a></span>`
                : `<a class="btn btn--primary btn--sm" href="/login">${t("Sign in")}</a>`
            )
      }</div>`;
  paintStage(root, hero);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroOf, heroName, portrait, showShared };
