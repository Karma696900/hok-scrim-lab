// settings page, pieces page: sectionsOf, read, setFigure, figure, and 4 more.
import { LANGUAGES } from "../../../shared/i18n.js";
import { MODULES, communityPart, partTile, parts } from "./parts.js";
import { avatarMarkup } from "../auth/auth-avatar.js";
import { controlLabel, controlText, modeLabel, modeText, pageLabel } from "./settings-labels.js";
import { currentDirection } from "../../app/display-preferences.js";
import { currentLanguage, t } from "../../app/browser-i18n.js";

export const sectionsOf = ui => [
  ui.flow.card(
    "parts",
    "grid",
    t("Parts of the site"),
    t(
      "Switch on a part you did not want before, or hide one you do not use. Hidden parts still open from their address."
    ),
    `<div class="st-mods">${partTile({ ...communityPart(), on: true, locked: true, input: ' name="community" value="community"' })}${parts()
      .map(part =>
        partTile({
          ...part,
          on: ui.enabled.has(part.id),
          input: ` name="module" value="${part.id}"`
        })
      )
      .join("")}</div>`
  ),
  ui.flow.card(
    "series",
    "swords",
    t("New series"),
    t("The set-up form of a new series starts with these choices."),
    `<div class="st-groups">
              ${ui.flow.group(
                t("Series format"),
                ui.flow.choices(
                  "bestOf",
                  BEST_OF.map(value => [value, t("Best of {count}", { count: value })]),
                  ui.settings.bestOf,
                  { className: "st-choices--4" }
                )
              )}
              ${ui.flow.group(
                t("Series hero rule"),
                ui.flow.choices(
                  "gameMode",
                  GAME_MODES.map(mode => [mode, modeLabel(mode), modeText(mode)]),
                  ui.settings.gameMode,
                  { rich: true }
                )
              )}
              ${ui.flow.group(
                t("Draft control"),
                ui.flow.choices(
                  "draftMode",
                  DRAFT_CONTROLS.map(control => [
                    control,
                    controlLabel(control),
                    controlText(control),
                    CONTROL_ICONS[control]
                  ]),
                  ui.settings.draftMode,
                  { rich: true }
                )
              )}
            </div>`
  ),
  ui.flow.card(
    "interface",
    "sun",
    t("Interface"),
    "",
    `<div class="st-iface">
              <div class="st-block st-block--langs"><h3>${t("Language")}</h3><div class="st-langs" role="group" aria-label="${t("Language")}">${LANGUAGES.map(item => `<button type="button" data-language="${item.code}" lang="${item.code}" aria-pressed="${item.code === ui.language}">${ui.flow.esc(item.name)}</button>`).join("")}</div></div>
              <div class="st-block"><h3>${t("Theme")}</h3><div class="st-themes" role="group" aria-label="${t("Theme")}">${ui.flow.themeTile("dark", t("Dark"), ui.theme)}${ui.flow.themeTile("light", t("Light"), ui.theme)}</div>
                <h3>${t("Text direction")}</h3>${ui.flow.segment(
                  "data-set-direction",
                  [
                    ["ltr", t("Left to right")],
                    ["rtl", t("Right to left")]
                  ],
                  currentDirection(),
                  t("Text direction")
                )}</div>
              <div class="st-block st-block--wide">
                <label class="label" for="set-start">${t("Start page")}<span class="field"><select id="set-start" name="startPage">${START_PAGES.map(path => `<option value="${ui.flow.esc(path)}"${path === ui.settings.startPage ? " selected" : ""}>${ui.flow.esc(pageLabel(path))}</option>`).join("")}</select></span></label>
                <label class="st-switch"><span><b>${t("Reduce animations")}</b></span><span class="switch-wrap"><input type="checkbox" role="switch" name="reduceMotion"${ui.settings.reduceMotion ? " checked" : ""}><i class="switch${ui.settings.reduceMotion ? " on" : ""}" aria-hidden="true"></i></span></label>
                <p class="st-note">${t("The start page opens when you come to the site. Reduced animations also apply when your device asks for them.")}</p>
              </div>
            </div>`
  ),
  ui.flow.card(
    "notifications",
    "bell",
    t("Notifications"),
    "",
    ui.user
      ? `<div class="st-links">${ui.flow.linkTile("/discord", "discord", t("Open Discord settings"), t("Choose which messages you receive on Discord, and link your account, on the Discord page."))}${ui.flow.linkTile("/inbox", "mail", t("Open the inbox"), t("Scrim requests and notifications in one place."))}</div>`
      : `<p class="st-note">${t("Sign in to get notifications.")} <a class="link" href="/login?next=%2Fsettings">${t("Sign in")}</a></p>`
  ),
  ...(ui.user
    ? [
        ui.flow.card(
          "account",
          "user",
          t("Account"),
          "",
          `<div class="st-me">${avatarMarkup(ui.user, 64)}<div><b>${ui.flow.esc(ui.user.name)}</b><small>${ui.user.tag ? `#${ui.flow.esc(ui.user.tag)} · ` : ""}${ui.flow.esc(ui.user.email ?? "")}</small></div>${ui.user.isAdmin ? `<span class="pill">${t("Admin")}</span>` : ""}</div>
                  <div class="st-links st-links--3">${ui.flow.linkTile("/account", "lock", t("Account security"))}${ui.user.tag ? ui.flow.linkTile(`/players/${encodeURIComponent(ui.user.tag)}`, "user", t("Your player page")) : ""}${ui.flow.linkTile("/welcome", "spark", t("Replay the welcome pages"))}</div>`
        ),
        ui.flow.card(
          "api",
          "key",
          t("API keys"),
          t(
            "Read your data and the data of the game from your own programs. A key only reads, never writes."
          ),
          `<div class="ak" id="api-keys-root"><p class="muted">${t("Loading…")}</p></div>`
        )
      ]
    : [])
];

export const read = ui => {
  const data = new FormData(ui.form);
  return {
    modules: MODULES.filter(id => data.getAll("module").includes(id)),
    settings: {
      bestOf: Number(data.get("bestOf")),
      gameMode: data.get("gameMode"),
      draftMode: data.get("draftMode"),
      startPage: data.get("startPage"),
      reduceMotion: data.has("reduceMotion")
    }
  };
};

// the figures of the stage say what the form says, now
export const setFigure = (ui, id, html) => {
  const node = ui.root.querySelector(`[data-fig="${id}"]`);
  if (node) {
    node.innerHTML = html;
  }
};

export const figure = (value, of) => `${value}${of ? `<small>/${of}</small>` : ""}`;

export const paintFigures = ui => {
  const now = ui.read();
  ui.setFigure("parts", figure(now.modules.length + 1, MODULES.length + 1));
  ui.setFigure("format", `BO${now.settings.bestOf}`);
  ui.setFigure("language", ui.flow.esc(currentLanguage().toUpperCase()));
};

// What the choices look like follows what is checked (the checkboxes and radios are the truth).
export const paint = ui => {
  for (const mod of ui.form.querySelectorAll(".mod")) {
    const on = mod.querySelector("input").checked;
    mod.classList.toggle("on", on);
    mod.querySelector(".check").classList.toggle("on", on);
  }
  for (const input of ui.form.querySelectorAll(".switch-wrap input")) {
    input.nextElementSibling.classList.toggle("on", input.checked);
  }
  ui.paintFigures();
};

export const refresh = ui => {
  ui.paint();
  ui.bar.hidden = JSON.stringify(ui.read()) === ui.saved;
};

// The sections of the page: the rail scrolls to them, and follows the page while it is read.
export const markSection = (ui, id) => {
  for (const other of ui.form.querySelectorAll(".st-rail a")) {
    other.classList.toggle("on", other.dataset.section === id);
  }
};

const BEST_OF = [1, 3, 5, 7];

const GAME_MODES = ["global-ban-pick", "free-for-all", "classic"];

const DRAFT_CONTROLS = ["solo", "two-players", "online"];

const CONTROL_ICONS = { solo: "user", "two-players": "users", online: "wifi" };

const START_PAGES = ["/", "/scrims", "/training", "/find", "/agenda"];

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { read, setFigure, paintFigures, paint, refresh, markSection };
