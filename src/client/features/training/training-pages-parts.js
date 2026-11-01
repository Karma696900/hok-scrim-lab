// training pages, small helpers: heroOf, heroName, portrait, sheetOf, and 9 more.
import { EXERCISES } from "../../../shared/reflex-model.js";
import { chromeHtml, patchChrome, zoneHead, zoneName } from "./training-shared.js";
import { exerciseArt } from "./reflex/art.js";
import { exerciseBlurb, exerciseName } from "../../domain/reflex-labels.js";
import { featuredHtml, howHtml, kindsHtml, paintFeatured } from "./showcase.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, paintStage } from "../community/stage.js";
import { responsive } from "../../../shared/media.js";
import { sceneHero } from "../../domain/scene-art.js";
import { skeleton } from "../../lib/skeleton.js";
import { t } from "../../app/browser-i18n.js";
import { ZONE_HERO } from "./training-pages-shared.js";
import { canRegister } from "../../app/app-state.js";

export const heroOf = (view, id) => view.state.heroes.find(item => item.id === id);

export const heroName = (view, id) => {
  const hero = view.heroOf(id);
  return hero ? hero.displayName || hero.name : id;
};

export const portrait = (view, id, size = 48, className = "") => {
  const hero = view.heroOf(id);
  const attributes = className ? ` class="${className}"` : "";
  return hero?.image
    ? `<img${attributes} ${responsive(hero.image, size)} alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="image-fallback${className ? ` ${className}` : ""}" aria-hidden="true"></span>`;
};

/**
 * The sheet of a hero (cached): its skills with their pictures, and what an administrator
 * entered.
 */
export function sheetOf(view, heroId) {
  if (!view.sheets.has(heroId)) {
    view.sheets.set(
      heroId,
      view.api(`/api/heroes/${encodeURIComponent(heroId)}`).catch(() => null)
    );
  }
  return view.sheets.get(heroId);
}

export const skillsOf = sheet => (sheet?.details?.skills ?? []).filter(skill => skill.id);

export const skillIcon = (view, skill, size = 40) =>
  skill?.basic
    ? `<span class="skill-pic skill-pic--basic" role="img" aria-label="${view.esc(skill.name)}">${icon("swords")}</span>`
    : skill?.icon
      ? `<img class="skill-pic" ${responsive(skill.icon, size)} alt="${view.esc(skill.name)}" width="${size}" height="${size}" loading="lazy" decoding="async">`
      : `<span class="skill-pic image-fallback" role="img" aria-label="${view.esc(skill?.name ?? "")}"></span>`;

export async function loadOverview(view) {
  const optional = (path, fallback) => view.api(path).catch(() => fallback);
  const [focus, assigned, review, notes, scenarios, reflex] = await Promise.all([
    view.api("/api/training/focus"),
    optional("/api/training/assigned", { teams: [] }),
    optional("/api/training/combos/review", null),
    optional("/api/training/notes", { notes: [] }),
    optional("/api/training/scenarios", { scenarios: [] }),
    optional(`/api/training/reflex?offset=${-new Date().getTimezoneOffset()}`, null)
  ]);
  view.overview = {
    focus: focus.heroIds,
    assigned,
    review,
    notes: notes.notes,
    scenarios: scenarios.scenarios,
    reflex
  };
  return view.overview;
}

/** The stage and the entries of a page (the options of `chromeHtml`, the cover is chosen here). */
export function chrome(view, options) {
  view.chromeOptions = {
    ...options,
    hero: options.hero ?? sceneHero(ZONE_HERO[options.zone] ?? 11)
  };
  return chromeHtml({
    ...view.chromeOptions,
    overview: options.entries === false ? null : view.overview
  });
}

/** Draws the cover of the stage that `chrome` made (the page calls it once it has drawn itself). */
export const paintChrome = view =>
  view.chromeOptions && paintStage(view.root, view.chromeOptions.hero);

/** The numbers changed (a hero ticked, a note saved…): the stage and the entries follow. */
export const refreshChrome = (view, hero) =>
  patchChrome(view.root, { overview: view.overview, hero });

/**
 * The page of a zone before its data has come (a frame, see platform/http/prerender.js): the stage the zone will
 * draw, with dashes for its numbers, then placeholders. The zone's own draw replaces it, the title staying where it is.
 */
export function frameOf(view, zone) {
  const hero = sceneHero(ZONE_HERO[zone] ?? 11);
  return {
    hero,
    html: `${chromeHtml({ zone, hero, ...zoneHead(zone, { admin: view.kit.isAdmin() }), pending: true })}<div class="trn-frame">${skeleton("grid", 3)}</div>`
  };
}

/** What a visitor sees of a zone that is theirs once they sign in. */
export function needSignIn(view, zone) {
  const preview = {
    heroes: () => `${featuredHtml(view.esc)}${howHtml()}`,
    notebook: () => `${kindsHtml()}${howHtml()}`,
    reflex: () =>
      `<div class="rx-list rx-list--preview">${EXERCISES.map(
        exercise =>
          `<div class="rx-sample"><span class="rx-card__art keep-dark">${exerciseArt(exercise.id)}</span><span class="rx-card__body"><b>${view.esc(exerciseName(exercise.id))}</b><p>${view.esc(exerciseBlurb(exercise.id))}</p></span></div>`
      ).join("")}</div>${howHtml()}`
  }[zone];
  // a visitor on /training reads what the training is (players search "hok training")
  const title = zone === "reflex" ? t("Reflex training") : t("Honor of Kings training");
  view.overview = null;
  view.root.innerHTML = `${view.chrome({
    zone,
    title: zone === "notebook" ? zoneName(zone) : title,
    text:
      zone === "notebook"
        ? t("What to practise: goals, mechanics, combos and video reviews. Only you can see it.")
        : zone === "reflex"
          ? t(
              "Short exercises for your reflexes, memory and aim. They run in your browser and send nothing while you play."
            )
          : t(
              "Combos, reflexes and map situations for Honor of Kings Global players: choose the heroes you work on, write down their combos and mechanics, train your reactions and study situations on the map."
            )
  })}<div class="trn-visitor">${zone === "heroes" ? `<p class="hstack wrap trn-visitor__links"><a class="btn btn--sm" href="/training/reflex">${icon("bolt", "i--sm")}${t("Reflex training")}</a><a class="btn btn--sm" href="/training/scenarios">${icon("target", "i--sm")}${t("Map situations")}</a></p>` : ""}${lineHtml(
    "lock",
    view.esc(title),
    t("Sign in to choose your heroes and keep your notebook."),
    `<span class="hstack"><a class="btn btn--primary btn--sm" href="/login?next=${encodeURIComponent(location.pathname)}">${t("Sign in")}</a>${canRegister() ? `<a class="btn btn--sm" href="/register">${t("Create account")}</a>` : ""}</span>`,
    "empty sign-in-prompt"
  )}${preview()}</div>`;
  view.paintChrome();
  paintFeatured(view.root);
}

/** What the three zones ask of the page that holds them. */
export const kitOf = view => ({
  api: view.api,
  esc: view.esc,
  tell: view.tell,
  go: view.go,
  state: view.state,
  root: () => view.root,
  signedIn: () => Boolean(view.state.auth.user),
  isAdmin: () => Boolean(view.state.auth.user?.isAdmin),
  heroOf: view.heroOf,
  heroName: view.heroName,
  portrait: view.portrait,
  sheetOf: view.sheetOf,
  skillsOf,
  skillIcon: view.skillIcon,
  chrome: view.chrome,
  paintChrome: view.paintChrome,
  refreshChrome: view.refreshChrome,
  needSignIn: view.needSignIn,
  get overview() {
    return view.overview;
  }
});

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  heroOf,
  heroName,
  portrait,
  sheetOf,
  skillIcon,
  loadOverview,
  chrome,
  paintChrome,
  refreshChrome,
  frameOf,
  needSignIn
};
