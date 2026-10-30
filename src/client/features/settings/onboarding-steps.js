// onboarding, small helpers: save, faces, body, paint, and 1 more.
import { LANGUAGES } from "../../../shared/i18n.js";
import { MODULES, communityPart, partTile, parts } from "./parts.js";
import { currentLanguage, t } from "../../app/browser-i18n.js";
import { fillSceneArt, sceneArtSlot, sceneHero } from "../../domain/scene-art.js";
import { icon } from "../../../shared/icons.js";
import { perks } from "../../domain/account-perks.js";
import { slotImage } from "../../lib/dom.js";
import { steps } from "./onboarding-shared.js";
import { canRegister } from "../../app/app-state.js";

export async function save(ui) {
  const modules = MODULES.filter(module => ui.chosen.has(module));
  writeLocalModules(modules);
  if (ui.flow.state.auth.user) {
    try {
      await ui.flow.api("/api/me/preferences", { method: "PUT", body: { modules } });
    } catch (error) {
      ui.flow.tell(error.message);
      return false;
    }
  }
  ui.flow.state.modules = modules;
  ui.flow.state.onboarded = true;
  ui.flow.applyModules();
  return true;
}

/** A row of real portraits: the heroes of the Global roster, with how many there are. */
export function faces(ui) {
  const shown = [
    ...new Map(
      [1, 2, 3, 4, 5, 6, 7, 8]
        .map(offset => sceneHero(offset))
        .filter(Boolean)
        .map(found => [found.id, found])
    ).values()
  ];
  const count = ui.flow.state.heroes.filter(
    item => item.availableGlobal !== false && !item.isFlowborn
  ).length;
  return count
    ? `<div class="ob-faces"><p><b>${count}</b><span>${t("Heroes")}</span></p><ul>${shown.map(found => `<li>${slotImage(found)}</li>`).join("")}</ul></div>`
    : "";
}

export function body(ui) {
  if (ui.step === 0) {
    const current = currentLanguage();
    return `<h1>${t("Welcome to HOK Global Scrim Lab")}</h1>
              <p class="lead">${t("A place for the competitive community of Honor of Kings Global: run scrims with the official draft, find opponents, schedule and train.")}</p>
              ${ui.faces()}
              <section class="ob-block" aria-labelledby="ob-language"><h2 id="ob-language">${t("Language")}</h2><div class="langs" role="group" aria-label="${t("Language")}">${LANGUAGES.map(language => `<button type="button" class="${language.code === current ? "on" : ""}" data-language="${language.code}" lang="${language.code}" aria-pressed="${language.code === current}">${ui.flow.esc(language.name)}</button>`).join("")}</div></section>
              <ul class="ob-perks">${perks()
                .map(
                  ([name, text]) =>
                    `<li><span class="ob-perks__ico">${icon(name)}</span>${text}</li>`
                )
                .join("")}</ul>
              <ul class="ob-points"><li>${icon("check", "i--sm")}${t("Only Global game data. No ranked data. Nothing is invented.")}</li><li>${icon("check", "i--sm")}${t("It takes a minute: you choose what you want to see, and you can change it at any time.")}</li></ul>`;
  }
  if (ui.step === 1) {
    return `<h1>${t("What do you want to see?")}</h1>
              <p class="lead">${t("Pick the parts you need. The others are hidden from your menu (their pages still open from a link).")}</p>
              <div class="ob-mods module-list">${partTile({ ...communityPart(), on: true, locked: true, input: ` aria-label="${ui.flow.esc(t("Community"))}"` })}${parts()
                .map(part =>
                  partTile({
                    ...part,
                    on: ui.chosen.has(part.id),
                    input: ` data-module="${part.id}"`
                  })
                )
                .join("")}</div>`;
  }
  if (ui.step === 2) {
    return `<h1>${t("The community")}</h1>
              <p class="lead">${t("This part is for everybody and always in your menu.")}</p>
              <div class="ob-team community-points">${community()
                .map(
                  ([name, title, text]) =>
                    `<div class="tile-info"><span class="tile-info__ico">${icon(name, "i--lg")}</span><b>${ui.flow.esc(title)}</b><small>${ui.flow.esc(text)}</small></div>`
                )
                .join("")}</div>
              ${ui.flow.state.auth.user ? "" : `<p class="ob-register">${icon("info", "i--sm")}<span>${canRegister() ? `${t("Create an account to use the community: it is free.")} <a class="link" href="/register">${t("Create account")}</a>` : `${t("Sign in to use the community features.")} <a class="link" href="/login">${t("Sign in")}</a>`}</span></p>`}`;
  }
  const picked = parts().filter(part => ui.chosen.has(part.id));
  const links = [
    ...picked.flatMap(part => part.links.map(link => [...link, part.text])),
    [
      "/teams",
      t("Create or join a team"),
      "shieldcheck",
      t("Create or join a team, with a roster, roles and invitations.")
    ],
    [
      "/discord",
      t("Link your Discord"),
      "discord",
      t("Link your account to get reminders and answer requests from Discord.")
    ]
  ];
  return `<h1>${t("You are ready")}</h1>
            <p class="lead">${t("Here is where to start. Your menu now shows only what you chose, and the community.")}</p>
            <div class="ob-ready start-list">${links.map(([href, label, name, text]) => `<a class="ob-go" href="${ui.flow.esc(href)}" data-start><span class="ob-go__ico">${icon(name, "i--lg")}</span><span class="ob-go__text"><b>${ui.flow.esc(label)}</b><small>${ui.flow.esc(text)}</small></span>${icon("right", "i--sm i--dir")}</a>`).join("")}</div>`;
}

export function paint(ui) {
  const last = ui.step === steps().length - 1;
  ui.root.innerHTML = `<section class="onboarding" aria-label="${t("Welcome")}">
            <div class="ob">
              <aside class="ob-side keep-dark">
                ${sceneArtSlot("ob-side__art", ui.hero)}
                <div class="ob-side__veil" aria-hidden="true"></div>
                <span class="ob-brand"><img src="/logo.svg" alt="" width="34" height="42"><span>HOK Global<br>Scrim Lab</span></span>
                <ol class="onboarding-steps" aria-label="${t("Steps")}">${steps()
                  .map(
                    (label, index) =>
                      `<li${index === ui.step ? ' aria-current="step"' : ""} class="${index < ui.step ? "done" : index === ui.step ? "on" : ""}"><span class="ob-n">${index < ui.step ? icon("check", "i--sm") : index + 1}</span><span>${ui.flow.esc(label)}</span></li>`
                  )
                  .join("")}</ol>
                <p class="ob-hook">${t("More than a game, a community.")}</p>
              </aside>
              <div class="ob-main">
                <div class="ob-top"><span class="ob-count">${t("Step {number} of {count}", { number: ui.step + 1, count: steps().length })}</span>${last ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-skip>${t("Skip, keep everything")}</button>`}</div>
                <div class="ob-body">${ui.body()}</div>
                <footer class="ob-foot">
                  ${ui.step > 0 ? `<button type="button" class="btn btn--ghost btn--lg" data-back>${icon("left", "i--dir")}${t("Back")}</button>` : "<span></span>"}
                  <button type="button" class="btn btn--primary btn--lg" data-next>${last ? t("Start") : t("Continue")}${icon("arrow", "i--dir")}</button>
                </footer>
              </div>
            </div>
          </section>`;
  fillSceneArt(ui.root.querySelector(".ob-side__art"), ui.hero);
  ui.root.querySelector("[data-next]").focus({ preventScroll: true });
}

export const community = () => [
  ["shieldcheck", t("Teams"), t("Create or join a team, with a roster, roles and invitations.")],
  [
    "search",
    t("Find a scrim"),
    t("Open announcements of teams that look for a scrim, and requests with counter-proposals.")
  ],
  ["calendar", t("Agenda"), t("Your teams' agenda with reminders, and who is coming.")],
  ["mail", t("Inbox"), t("Scrim requests and notifications in one place.")],
  ["user", t("Player profile"), t("Your public page: main heroes, languages, teams.")],
  [
    "discord",
    t("Discord"),
    t("Link your account to get reminders and answer requests from Discord.")
  ]
];

const STORAGE_KEY = "hok.modules";

/** A visitor without an account keeps the choice in this browser only (app.js reads it back). */
const writeLocalModules = modules => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  } catch {
    /* private mode: the choice then only lasts for this visit */
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { save, faces, body, paint };
