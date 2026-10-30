// What a click, a drag and the keys do on a tier list.
import { api } from "../../app/api-client.js";
import { app, tell } from "../../lib/dom.js";
import { reloadTierLists } from "../../app/roster-data.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { currentTierList, tierUi } from "./tier-list-shared.js";
import { reserveGrid } from "./tier-list-markup.js";

// Saves go one after the other: two quick edits (a rename that ends on Tab, then a click on a move
// button) used to send two PUTs with the SAME version, the second was refused as a conflict and the page
// reloaded the list without the second edit. Each save now starts when the previous one is done, from the
// list as it is then (its edits included) and with the version the previous save returned.
let saving = Promise.resolve();

export function persistTierList(tierList) {
  const run = saving.then(() => save(tierList));
  saving = run.catch(() => {});
  return run;
}

async function save(tierList) {
  try {
    const saved = await api(`/api/tier-lists/${encodeURIComponent(tierList.id)}`, {
      method: "PUT",
      body: { ...tierList, expectedVersion: tierList.version }
    });
    tierList.version = saved.version;
  } catch (error) {
    if (error.code === "version_conflict") {
      await reloadTierLists();
      render();
    }
    throw error;
  }
}

/** Takes a hero out of wherever it is and puts it at the end of a tier (or of the reserve). False when the tier is not there. */
function placeHero(list, heroId, target) {
  const tier = target === "unranked" ? null : list.tiers.find(item => item.id === target);
  if (target !== "unranked" && !tier) {
    return false;
  }
  list.unranked = list.unranked.filter(value => value !== heroId);
  for (const item of list.tiers) {
    item.heroes = item.heroes.filter(value => value !== heroId);
  }
  (tier ? tier.heroes : list.unranked).push(heroId);
  return true;
}

/** Only the reserve is drawn again while someone types in its search (so the field keeps its focus). */
function renderReserveGrid() {
  const list = currentTierList();
  const grid = app.querySelector("#tier-reserve-grid");
  if (list && grid) {
    grid.innerHTML = reserveGrid(list, list.viewer?.canEdit !== false);
  }
}

/** The chip a key or a click is about, and the list it belongs to when it can be edited. */
const editableList = () => {
  const list = currentTierList();
  return list && list.viewer?.canEdit !== false ? list : null;
};

/** Moves a hero to a tier (or the reserve) and keeps it: a drop, a button of the bar, a key. */
export async function sendHero(heroId, target) {
  const list = editableList();
  if (!list || !heroId || !placeHero(list, heroId, target)) {
    return;
  }
  tierUi.picked = null;
  tierUi.focus = heroId;
  try {
    await persistTierList(list);
  } catch (error) {
    tell(error.message);
  } finally {
    render();
  }
}

export function installTierListsLists() {
  app.addEventListener("dragstart", event => {
    // only the heroes of this page (the ratings draw their own, and handle their own drag)
    const chip = event.target.closest?.(".tier-avatar[data-action='tier-pick'][draggable='true']");
    if (chip) {
      event.dataTransfer.setData("text/plain", chip.dataset.heroId);
      event.dataTransfer.effectAllowed = "move";
      chip.classList.add("is-dragging");
    }
  });

  app.addEventListener("dragend", event => {
    event.target.closest?.(".tier-avatar")?.classList.remove("is-dragging");
    for (const zone of app.querySelectorAll(".tier-drop.is-over")) {
      zone.classList.remove("is-over");
    }
  });

  app.addEventListener("dragover", event => {
    const zone = event.target.closest?.("[data-drop-tier]");
    if (zone) {
      event.preventDefault();
      for (const other of app.querySelectorAll(".tier-drop.is-over")) {
        if (other !== zone) {
          other.classList.remove("is-over");
        }
      }
      zone.classList.add("is-over");
    }
  });

  app.addEventListener("dragleave", event => {
    const zone = event.target.closest?.("[data-drop-tier]");
    if (zone && !zone.contains(event.relatedTarget)) {
      zone.classList.remove("is-over");
    }
  });

  app.addEventListener("drop", async event => {
    const target = event.target.closest?.("[data-drop-tier]");
    if (!target) {
      return;
    }
    event.preventDefault();
    target.classList.remove("is-over");
    await sendHero(event.dataTransfer.getData("text/plain"), target.dataset.dropTier);
  });

  // a tier or the reserve clicked while a hero is picked: the hero goes there
  app.addEventListener("click", event => {
    const zone = event.target.closest?.("[data-drop-tier]");
    if (zone && tierUi.picked && !event.target.closest("[data-action]")) {
      sendHero(tierUi.picked, zone.dataset.dropTier).catch(error => tell(error.message));
    }
  });

  // the reserve: what is typed filters it without drawing the page again
  app.addEventListener("input", event => {
    if (event.target.id === "tier-reserve-search") {
      tierUi.query = event.target.value;
      renderReserveGrid();
    }
  });
}

export function installTierListsBoard() {
  // the keyboard: arrows go from a hero to the next, Enter picks, a digit sends, Escape lets go
  app.addEventListener("keydown", event => {
    const chip = event.target.closest?.(".tier-avatar[role='button']");
    if (!chip || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const heroId = chip.dataset.heroId;
    const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tierUi.picked = tierUi.picked === heroId ? null : heroId;
      tierUi.focus = heroId;
      render();
    } else if (event.key === "Escape" && tierUi.picked) {
      tierUi.picked = null;
      tierUi.focus = heroId;
      render();
    } else if (arrows.includes(event.key)) {
      event.preventDefault();
      focusNeighbour(chip, event.key);
    } else if (/^[0-9]$/.test(event.key)) {
      const list = editableList();
      const tier = event.key === "0" ? { id: "unranked" } : list?.tiers[Number(event.key) - 1];
      if (tier) {
        event.preventDefault();
        sendHero(heroId, tier.id).catch(error => tell(error.message));
      }
    }
  });

  // the chip that has the focus is the one stop of the Tab key of its place
  app.addEventListener("focusin", event => {
    const chip = event.target.closest?.(".tier-avatar[role='button']");
    const zone = chip?.closest("[data-drop-tier]");
    if (zone) {
      for (const other of zone.querySelectorAll(".tier-avatar[role='button']")) {
        other.tabIndex = other === chip ? 0 : -1;
      }
    }
  });

  // A tier list exported earlier (JSON) chosen in the file picker.
  document.addEventListener("change", async event => {
    if (event.target.id !== "tier-import-file") {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.tiers) || !Array.isArray(parsed.unranked)) {
        throw new Error(t("This is not a valid tier list JSON."));
      }
      const imported = await api("/api/tier-lists", {
        method: "POST",
        body: {
          name: parsed.name,
          lane: parsed.lane ?? undefined,
          tiers: parsed.tiers,
          unranked: parsed.unranked
        }
      });
      await reloadTierLists();
      state.activeTierId = imported.id;
      render();
      tell(t("Tier list imported"));
    } catch (error) {
      tell(error.message);
    }
    event.target.value = "";
  });
}

/** The hero chip a direction key leads to: along the place for left and right, by the picture for up and down. */
function focusNeighbour(chip, key) {
  const all = [...app.querySelectorAll(".tier-avatar[role='button']")];
  const rtl = document.documentElement.dir === "rtl";
  const index = all.indexOf(chip);
  let next = null;
  if (key === "Home" || key === "End") {
    const zone = [
      ...chip.closest("[data-drop-tier]").querySelectorAll(".tier-avatar[role='button']")
    ];
    next = key === "Home" ? zone[0] : zone.at(-1);
  } else if (key === "ArrowLeft" || key === "ArrowRight") {
    const forward = (key === "ArrowRight") !== rtl;
    next = all[index + (forward ? 1 : -1)] ?? null;
  } else {
    const here = chip.getBoundingClientRect();
    const down = key === "ArrowDown";
    let best = Infinity;
    for (const other of all) {
      const box = other.getBoundingClientRect();
      const dy = down ? box.top - here.top : here.top - box.top;
      if (dy > 8) {
        const cost = dy * 4 + Math.abs(box.left - here.left);
        if (cost < best) {
          best = cost;
          next = other;
        }
      }
    }
  }
  next?.focus();
}
