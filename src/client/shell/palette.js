import { icon } from "../../shared/icons.js";
import { api } from "../app/api-client.js";
import { escapeHtml } from "../lib/dom.js";
import { t } from "../app/browser-i18n.js";
import { go } from "../app/router.js";
import {
  GROUP_LABELS,
  heroEntries,
  pageEntries,
  pick,
  pieceEntries,
  teamEntry
} from "./palette-entries.js";

// The command palette (Ctrl K, or a click on the search field of the top bar): pages, heroes, the items,
// arcana and spells of the game, and teams, with the keyboard.

let scrim = null;

/** The dialog: the search field above the list that render() fills. */
const paletteMarkup =
  () => `<div class="palette" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("Search"))}">
      <label class="field">${icon("search")}<input id="palette-input" type="search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="${escapeHtml(t("Search a hero, an item, an arcana, a team…"))}" placeholder="${escapeHtml(t("Search a hero, an item, an arcana, a team…"))}" autocomplete="off"><span class="kbd">Esc</span></label>
      <div class="palette__list" id="palette-list" role="listbox"></div>
    </div>`;

/** The results, a heading before each group; a sentence when nothing matches. */
function listMarkup(shown, at, typed) {
  const names = GROUP_LABELS();
  let group = "";
  return (
    shown
      .map((entry, index) => {
        const heading =
          entry.group === group
            ? ""
            : `<div class="palette__group" role="presentation">${escapeHtml(names[entry.group])}</div>`;
        group = entry.group;
        return `${heading}<button type="button" role="option" aria-selected="${index === at}" class="palette__item${index === at ? " on" : ""}" data-at="${index}">${entry.lead}<span>${escapeHtml(entry.label)}</span>${entry.hint ? `<small>${escapeHtml(entry.hint)}</small>` : ""}</button>`;
      })
      .join("") ||
    `<p class="muted palette__empty">${t("No result for “{query}”", { query: escapeHtml(typed) })}</p>`
  );
}

function closePalette() {
  scrim?.remove();
  scrim = null;
}

export function openPalette() {
  if (scrim) {
    return;
  }
  const previous = document.activeElement;
  const entries = [...pageEntries(), ...heroEntries()];
  let teams = [];
  let gamePieces = [];
  let shown = [];
  let at = 0;
  let asked = 0;

  scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.innerHTML = paletteMarkup();
  document.body.append(scrim);
  const input = scrim.querySelector("#palette-input");
  const list = scrim.querySelector("#palette-list");
  const close = () => {
    closePalette();
    previous?.focus?.();
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    // the pieces of the game only appear once something is typed
    const matching = [...entries, ...(query ? gamePieces : []), ...teams].filter(
      entry =>
        !query ||
        entry.label.toLowerCase().includes(query) ||
        entry.alt?.toLowerCase().includes(query)
    );
    // pages, heroes, items, arcana, spells, teams; the empty search shows a short start
    shown = query ? pick(matching, 14) : matching.slice(0, 9);
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.innerHTML = listMarkup(shown, at, input.value);
    for (const image of list.querySelectorAll(".pt[data-size]")) {
      image.style.setProperty("--s", `${image.dataset.size}px`);
    }
    list.querySelector(".palette__item.on")?.scrollIntoView({ block: "nearest" });
  };

  const choose = index => {
    const entry = shown[index];
    if (entry) {
      close();
      go(entry.href);
    }
  };

  let timer = 0;
  const searchTeams = query => {
    clearTimeout(timer);
    if (query.length < 2) {
      teams = [];
      return;
    }
    timer = setTimeout(async () => {
      const ticket = ++asked;
      try {
        const { items } = await api(`/api/teams?q=${encodeURIComponent(query)}&pageSize=5`);
        if (ticket !== asked || !scrim) {
          return;
        }
        teams = items.map(teamEntry);
        render();
      } catch {
        /* the pages and the heroes are still there */
      }
    }, 220);
  };

  const loadPieces = () =>
    pieceEntries().then(found => {
      if (scrim && found !== gamePieces) {
        gamePieces = found;
        render();
      }
    });

  input.addEventListener("input", () => {
    at = 0;
    searchTeams(input.value.trim());
    if (input.value.trim() && !gamePieces.length) {
      loadPieces();
    }
    render();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      at = Math.min(shown.length - 1, at + 1);
    } else if (event.key === "ArrowUp") {
      at = Math.max(0, at - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(at);
      return;
    } else {
      return;
    }
    event.preventDefault();
    render();
  });
  scrim.addEventListener("click", event => {
    const button = event.target.closest("[data-at]");
    if (button) {
      choose(Number(button.dataset.at));
    } else if (event.target === scrim) {
      close();
    }
  });
  scrim.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  });
  render();
  input.focus();
}
