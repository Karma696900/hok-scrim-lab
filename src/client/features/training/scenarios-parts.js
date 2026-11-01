// scenarios, small helpers: legend, colours, keysCard, mapsAdmin, and 2 more.
import { PIN_KINDS, glyph, pinLabel, sideLabel, zoneHead } from "./training-shared.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, stepsHtml } from "../community/stage.js";
import { mapMarkup, mapUrl, placePins } from "./map.js";
import { number, t } from "../../app/browser-i18n.js";
import { tx } from "../../domain/staff-content.js";

/** The heroes of each side, and which of them are dead. */
export const legend = (view, pins) => {
  const side = name => {
    const list = pins.filter(pin => pin.type === "hero" && pin.side === name);
    return `<div class="legend-side ${name}"><h2>${esc(sideLabel(name))}</h2>${
      list.length
        ? `<ul class="trn-who">${list.map(pin => `<li class="wchip${pin.dead ? " dead is-dead" : ""}"><span class="pt s-32">${view.portrait(pin.heroId, 32)}</span><b>${esc(view.heroName(pin.heroId))}</b>${pin.dead ? `<small>${t("Dead")}</small>` : ""}</li>`).join("")}</ul>`
        : `<p class="muted">${t("No hero")}</p>`
    }</div>`;
  };
  return `<div class="mapwho scenario-legend">${side("blue")}${side("red")}</div>`;
};

/** What the colours of the pins mean. */
export const colours = () =>
  `<div class="tmap__legend"><span><i class="c-blue"></i>${esc(sideLabel("blue"))}</span><span><i class="c-red"></i>${esc(sideLabel("red"))}</span><span><i class="c-neutral"></i>${esc(sideLabel(""))}</span><span><i class="x"></i>${t("Dead")}</span></div>`;

/** How to read a map: the sides, the dead, and the pins of the game. */
export const keysCard = () => `<section class="card trn-keys" aria-labelledby="trn-keys-title">
      <div class="card__head"><h2 id="trn-keys-title">${t("Pins")}</h2></div>
      ${colours()}
      <ul class="trn-keys__list">${PIN_KINDS.map(kind => `<li><span class="trn-keys__glyph">${glyph(kind)}</span>${esc(pinLabel(kind))}</li>`).join("")}</ul>
    </section>`;

// ---- the maps (administrators) -------------------------------------------------------------------
// `board`: the address of the picture the Game Simulation uses as its board (or null)
export const mapsAdmin = (maps, board = null) => `<section class="card trn-maps">
      <div class="card__head"><h2>${t("Maps")}</h2><span class="pill pill--grey">${t("Administrators")}</span></div>
      <p class="muted">${t("Upload the map of the game (PNG, JPEG or WebP, 12 MB at most). Pins are placed on it: nothing is drawn for you.")}</p>
      <ul class="list map-list">${
        maps
          .map(
            map =>
              `<li class="row"><img src="${mapUrl(map)}" alt="" width="96" height="${Math.round((96 * map.height) / map.width)}" loading="lazy" decoding="async"><span class="row__body"><b>${esc(map.name)}</b><small>${map.width} × ${map.height}</small>${board === mapUrl(map) ? `<span class="pill pill--grey">${t("Board of the Game Simulation")}</span>` : ""}</span>${board === mapUrl(map) ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-sim-map="${esc(map.id)}">${t("Use in the Game Simulation")}</button>`}<button type="button" class="btn btn--ghost btn--sm" data-remove-map="${esc(map.id)}">${icon("trash", "i--sm")}${t("Delete")}</button></li>`
          )
          .join("") || `<li class="muted">${t("No map yet.")}</li>`
      }</ul>
      <form id="map-form" class="form-grid" novalidate>
        <label class="label full">${t("Name")}<span class="field"><input id="map-name" name="name" maxlength="80" required></span></label>
        <label class="label full">${t("Picture")}<span class="field"><input id="map-file" type="file" accept="image/png,image/jpeg,image/webp"></span></label>
        <div class="full"><button class="btn btn--primary" type="submit">${icon("upload")}${t("Upload the map")}</button></div>
      </form>
    </section>`;

// ---- the list ------------------------------------------------------------------------------------
export async function showList(view) {
  const root = view.kit.root();
  const [known, { maps }] = await Promise.all([
    view.kit.overview
      ? Promise.resolve({ scenarios: view.kit.overview.scenarios })
      : view.api("/api/training/scenarios"),
    view.api("/api/training/maps")
  ]);
  const admin = view.kit.isAdmin();
  const board = admin
    ? (await view.api("/api/simulation/map").catch(() => ({ image: null }))).image
    : null;
  const scenarios = known.scenarios;
  const mapOf = id => maps.find(map => map.id === id);
  const row = scenario => {
    const map = mapOf(scenario.mapId);
    return `<a class="trn-sit" href="/training/scenarios/${encodeURIComponent(scenario.id)}"><span class="trn-sit__map keep-dark">${map ? `<img src="${mapUrl(map)}" alt="" width="320" height="${Math.round((320 * map.height) / map.width)}" loading="lazy" decoding="async">` : ""}</span><span class="trn-sit__body"><b class="scenario-title">${esc(tx(scenario.title))}</b>${scenario.brief ? `<span class="trn-sit__brief">${esc(tx(scenario.brief))}</span>` : ""}<span class="trn-sit__meta"><span class="pill pill--grey">${icon("pin", "i--sm")}${t("{count} pins", { count: scenario.pinCount })}</span>${scenario.published ? "" : `<span class="pill pill--warn">${t("Draft")}</span>`}${map ? `<span class="muted">${esc(map.name)}</span>` : ""}</span></span><span class="trn-sit__go" aria-hidden="true">${icon("right")}</span></a>`;
  };
  const steps = stepsHtml(
    [
      [
        "map",
        t("Study the map"),
        t("Who is where, who is dead, what the camps and objectives are doing.")
      ],
      ["target", t("Decide"), t("Put yourself in the position: what do you do next, and why?")],
      [
        "pencil",
        t("Write your answer"),
        t("It is saved on your account and you can change it any time.")
      ]
    ],
    "trn-steps"
  );
  root.innerHTML = `${view.kit.chrome({
    zone: "scenarios",
    ...zoneHead("scenarios", { admin })
  })}
      <div class="trn-sits">
        <div class="scenario-grid trn-sits__list">${
          scenarios.map(row).join("") ||
          `${lineHtml("map", t("No situation yet"), t("The administrators have not prepared any situation. Come back soon."))}${steps}`
        }</div>
        <aside class="trn-sits__side">${keysCard()}${admin ? mapsAdmin(maps, board) : ""}</aside>
      </div>`;
  view.kit.paintChrome();
  root.onclick = event => {
    if (event.target.closest("[data-new-scenario]")) {
      if (!maps.length) {
        return view.tell(t("Upload a map first."));
      }
      view.editor.show(null, maps);
    }
    const simulationMap = event.target.closest("[data-sim-map]");
    if (simulationMap) {
      view
        .api("/api/simulation/map", {
          method: "PUT",
          body: { mapId: simulationMap.dataset.simMap }
        })
        .then(view.showList)
        .catch(error => view.tell(error.message));
    }
    const remove = event.target.closest("[data-remove-map]");
    if (remove && confirm(t("Delete this map?"))) {
      view
        .api(`/api/training/maps/${encodeURIComponent(remove.dataset.removeMap)}`, {
          method: "DELETE"
        })
        .then(view.showList)
        .catch(error => view.tell(error.message));
    }
  };
  root.onsubmit = async event => {
    if (event.target.id !== "map-form") {
      return;
    }
    event.preventDefault();
    const file = event.target.querySelector("input[type=file]").files[0];
    const name = event.target.querySelector("input[name=name]").value;
    if (!file) {
      return view.tell(t("Choose a picture first."));
    }
    try {
      const response = await fetch(`/api/training/maps?name=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file
      }); // the raw file, not JSON
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => null))?.error ||
            t("This file is not a usable picture.")
        );
      }
      await view.showList();
    } catch (error) {
      view.tell(error.message);
    }
  };
  root.onchange = null;
  root.oninput = null;
}

// ---- one situation -------------------------------------------------------------------------------
export async function show(view, id) {
  const root = view.kit.root();
  const back = { href: "/training/scenarios", label: t("Situations") };
  let scenario;
  try {
    scenario = await view.api(`/api/training/scenarios/${encodeURIComponent(id)}`);
  } catch {
    root.innerHTML = `${view.kit.chrome({ zone: "scenarios", title: t("Situation not found"), back, slim: true, entries: false, figures: [] })}${lineHtml("map", t("Situation not found"), "", `<a class="btn btn--sm" href="/training/scenarios">${t("Back to the situations")}</a>`)}`;
    view.kit.paintChrome();
    return;
  }
  const [{ maps }, others] = await Promise.all([
    view.api("/api/training/maps"),
    view.api("/api/training/scenarios").catch(() => ({ scenarios: [] }))
  ]);
  const map = maps.find(item => item.id === scenario.mapId);
  const admin = view.kit.isAdmin();
  const heroPins = side => scenario.pins.filter(pin => pin.type === "hero" && pin.side === side);
  const at = others.scenarios.findIndex(item => item.id === scenario.id);
  const near = at < 0 ? [] : [others.scenarios[at - 1], others.scenarios[at + 1]];
  const pager = ([before, after]) =>
    before || after
      ? `<nav class="trn-pager" aria-label="${t("Situations")}">${[
          [before, "left", t("Previous")],
          [after, "right", t("Next")]
        ]
          .map(([item, arrow, label]) =>
            item
              ? `<a class="trn-pager__link trn-pager__link--${arrow}" href="/training/scenarios/${encodeURIComponent(item.id)}">${arrow === "left" ? icon("left", "i--sm") : ""}<span><small>${label}</small><b>${esc(tx(item.title))}</b></span>${arrow === "right" ? icon("right", "i--sm") : ""}</a>`
              : ""
          )
          .join("")}</nav>`
      : "";
  const answer = scenario.answer?.answer ?? "";
  root.innerHTML = `${view.kit.chrome({
    zone: "scenarios",
    title: esc(tx(scenario.title)),
    text: scenario.published
      ? t("Study the position, then write what you would do.")
      : t("Draft: only administrators see it."),
    back,
    slim: true,
    entries: false,
    figures: [
      [number(scenario.pins.length), t("Pins")],
      [number(heroPins("blue").length), sideLabel("blue")],
      [number(heroPins("red").length), sideLabel("red")]
    ],
    actions: admin
      ? `<button class="btn btn--lg" type="button" data-edit-scenario>${icon("pencil")}${t("Edit")}</button>`
      : ""
  })}
      <div class="trn-scene">
        <section class="mapcard keep-dark trn-scene__map">
          ${map ? mapMarkup(view.kit, map, scenario.pins) : ""}
          <div class="mapfoot">${colours()}</div>
          ${view.legend(scenario.pins)}
        </section>
        <aside class="trn-scene__side">
          ${scenario.brief ? `<section class="card card--feature trn-brief"><div class="card__head"><h2>${t("The situation")}</h2></div><p class="note-body">${esc(tx(scenario.brief))}</p></section>` : ""}
          <section class="card trn-answer">
            <div class="card__head"><h2>${t("Your answer")}</h2></div>
            ${
              view.kit.signedIn()
                ? `<form id="answer-form" novalidate>
                    <label class="label" for="answer-text">${t("What would you do, and why?")}<span class="field field--area"><textarea id="answer-text" rows="7" maxlength="${ANSWER_MAX}">${esc(answer)}</textarea></span></label>
                    <small class="trn-count" id="answer-count">${number(answer.length)} / ${number(ANSWER_MAX)}</small>
                    <p class="form-error" id="answer-error" role="alert"></p>
                    <button class="btn btn--primary" type="submit">${icon("check")}${t("Save my answer")}</button>
                  </form>`
                : `<p class="muted">${t("Sign in to write your answer.")} <a class="link" href="/login?next=${encodeURIComponent(location.pathname)}">${t("Sign in")}</a></p>`
            }
          </section>
          ${pager(near)}
        </aside>
      </div>`;
  view.kit.paintChrome();
  placePins(root);
  root.onclick = event => {
    if (event.target.closest("[data-edit-scenario]")) {
      view.editor.show(scenario, maps);
    }
  };
  root.onsubmit = async event => {
    event.preventDefault();
    const error = root.querySelector("#answer-error");
    try {
      await view.api(`/api/training/scenarios/${encodeURIComponent(scenario.id)}/answer`, {
        method: "PUT",
        body: { answer: root.querySelector("#answer-text").value }
      });
      view.tell(t("Answer saved."));
    } catch (failure) {
      error.textContent = failure.message;
    }
  };
  root.onchange = null;
  root.oninput = event => {
    if (event.target.id === "answer-text") {
      root.querySelector("#answer-count").textContent =
        `${number(event.target.value.length)} / ${number(ANSWER_MAX)}`;
    }
  };
}

const ANSWER_MAX = 2000;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { legend, showList, show };
