// scenario editor, drawn: toolButton, toolCard, pinRow, pinsCard, and 8 more.
import { PIN_KINDS, glyph, newPinId, pinLabel, sideLabel } from "./training-shared.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { mapMarkup, placePins } from "./map.js";
import { number, t } from "../../app/browser-i18n.js";

// ---- what is drawn -------------------------------------------------------------------------
export const toolButton = (id, active, label) =>
  `<button type="button" class="${active ? "on" : ""}" data-tool="${id}" aria-pressed="${active}">${label}</button>`;

export const toolCard = page => `<section class="card">
        <div class="card__head"><h2>${t("Tool")}</h2></div>
        <div class="seg segmented tool-bar" role="group" aria-label="${t("Tool")}">
          ${toolButton("hero:blue", page.isTool("hero", "blue"), `${t("Hero")} · ${t("Blue")}`)}
          ${toolButton("hero:red", page.isTool("hero", "red"), `${t("Hero")} · ${t("Red")}`)}
          ${PIN_KINDS.map(kind => toolButton(kind, page.tool.type === kind, `${glyph(kind)}<span>${esc(pinLabel(kind))}</span>`)).join("")}
        </div>
        ${
          page.tool.type === "hero"
            ? `<div class="label">${t("Hero")}${page.heroOptions()}</div>`
            : `<div class="form-grid">
                <label class="label">${t("Name on the map")}<span class="field"><input id="tool-label" maxlength="40" value="${esc(page.tool.label)}"></span></label>
                <label class="label">${t("Belongs to")}<span class="field"><select id="tool-side"><option value="">${t("Neutral")}</option><option value="blue"${page.tool.side === "blue" ? " selected" : ""}>${t("Blue side")}</option><option value="red"${page.tool.side === "red" ? " selected" : ""}>${t("Red side")}</option></select></span></label>
              </div>`
        }
      </section>`;

export const pinRow = (page, item) =>
  `<li><button type="button" class="row pin-row${item.id === page.selected ? " active" : ""}" data-select="${esc(item.id)}" aria-pressed="${item.id === page.selected}">${
    item.type === "hero"
      ? `<span class="pt s-28">${page.view.portrait(item.heroId, 28)}</span><span class="row__body"><b>${esc(page.view.heroName(item.heroId))}</b><small>${esc(sideLabel(item.side))}${item.dead ? ` · ${t("Dead")}` : ""}</small></span>`
      : `${glyph(item.type)}<span class="row__body"><b>${esc(pinLabel(item.type))}</b>${item.label ? `<small>${esc(item.label)}</small>` : ""}</span>`
  }</button></li>`;

export const pinsCard = (page, pin) => `<section class="card">
        <div class="card__head"><h2>${t("Pins")}</h2><span class="count">${page.draft.pins.length}</span></div>
        <ul class="list pin-list">${page.draft.pins.map(page.pinRow).join("") || `<li class="muted">${t("No pin yet.")}</li>`}</ul>
        ${
          pin
            ? `<div class="hstack wrap pin-actions">${pin.type === "hero" ? `<button type="button" class="btn btn--sm" data-dead aria-pressed="${Boolean(pin.dead)}">${pin.dead ? t("Mark as alive") : t("Mark as dead")}</button>` : ""}<button type="button" class="btn btn--sm btn--danger" data-delete-pin>${icon("trash", "i--sm")}${t("Remove the pin")}</button></div>`
            : ""
        }
      </section>`;

export const formCard = page => `<form id="scenario-form" class="card form-grid" novalidate>
        <label class="label full">${t("Title")}<span class="field"><input id="sc-title" name="title" maxlength="80" required value="${esc(page.draft.title)}"></span></label>
        <label class="label full">${t("The situation")}<span class="field field--area"><textarea id="sc-brief" name="brief" rows="4" maxlength="1000">${esc(page.draft.brief)}</textarea></span></label>
        <label class="label">${t("Map")}<span class="field"><select id="sc-map" name="mapId">${page.maps.map(item => `<option value="${esc(item.id)}"${item.id === page.draft.mapId ? " selected" : ""}>${esc(item.name)}</option>`).join("")}</select></span></label>
        <label class="check-line"><input type="checkbox" name="published"${page.draft.published ? " checked" : ""}> ${t("Published")}</label>
        <p class="form-error full" id="sc-error" role="alert"></p>
        <div class="full hstack wrap"><button class="btn btn--primary" type="submit">${icon("check")}${t("Save")}</button><button class="btn btn--ghost" type="button" data-leave>${t("Cancel")}</button>${page.existing ? `<button class="btn btn--danger" type="button" data-delete-scenario>${icon("trash")}${t("Delete")}</button>` : ""}</div>
      </form>`;

export const heroPins = (page, side) =>
  page.draft.pins.filter(pin => pin.type === "hero" && pin.side === side);

/** The numbers of the stage follow the pins. */
export function updateFigures(page) {
  for (const [id, value] of [
    ["sc-fig-pins", page.draft.pins.length],
    ["sc-fig-blue", page.heroPins("blue").length],
    ["sc-fig-red", page.heroPins("red").length]
  ]) {
    const node = page.root.querySelector(`#${id}`);
    if (node) {
      node.textContent = number(value);
    }
  }
}

export function paint(page) {
  const pin = page.draft.pins.find(item => item.id === page.selected);
  page.root.querySelector("#sc-layout").innerHTML =
    `<section class="mapcard keep-dark trn-scene__map">${mapMarkup(page.view.kit, page.mapOf(), page.draft.pins, { editable: true, selected: page.selected })}</section>
          <div class="stack-y trn-scene__side">${page.toolCard()}${page.pinsCard(pin)}${page.formCard()}</div>`;
  placePins(page.root);
  page.updateFigures();
}

export const readForm = page => {
  const form = page.root.querySelector("#scenario-form");
  if (!form) {
    return;
  }
  const data = new FormData(form);
  Object.assign(page.draft, {
    title: data.get("title"),
    brief: data.get("brief"),
    mapId: data.get("mapId"),
    published: data.has("published")
  });
};

export const clamp = value => Math.min(1, Math.max(0, Math.round(value * 10_000) / 10_000));

export const pointOf = (event, board) => {
  const box = board.getBoundingClientRect();
  return {
    x: clamp((event.clientX - box.left) / box.width),
    y: clamp((event.clientY - box.top) / box.height)
  };
};

/** A click on the empty map puts the chosen tool there (the rules of a side are kept). */
export const place = (page, board, event) => {
  page.readForm();
  const at = pointOf(event, board);
  if (page.tool.type === "hero") {
    if (!page.tool.heroId) {
      return page.view.tell(t("Choose a hero first."));
    }
    const same = page.draft.pins.filter(pin => pin.type === "hero" && pin.side === page.tool.side);
    if (same.some(pin => pin.heroId === page.tool.heroId)) {
      return page.view.tell(t("This hero is already on that side."));
    }
    if (same.length >= MAX_PER_SIDE) {
      return page.view.tell(t("A side has at most 5 heroes."));
    }
    page.draft.pins.push({
      id: newPinId(),
      type: "hero",
      heroId: page.tool.heroId,
      side: page.tool.side,
      dead: false,
      ...at
    });
  } else {
    page.draft.pins.push({
      id: newPinId(),
      type: page.tool.type,
      label: page.tool.label,
      side: page.tool.side === "blue" || page.tool.side === "red" ? page.tool.side : null,
      ...at
    });
  }
  page.selected = page.draft.pins.at(-1).id;
  page.paint();
};

const MAX_PER_SIDE = 5;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  toolCard,
  pinRow,
  pinsCard,
  formCard,
  heroPins,
  updateFigures,
  paint,
  readForm,
  place
};
