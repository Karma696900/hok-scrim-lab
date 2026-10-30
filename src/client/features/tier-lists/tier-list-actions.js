import { onAction, onChange } from "../../app/event-actions.js";
import { t } from "../../app/browser-i18n.js";
import { api } from "../../app/api-client.js";
import { reloadTierLists } from "../../app/roster-data.js";
import { id, downloadJson, safeFilename } from "../../lib/dom.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { recolourTier } from "../../domain/tier-labels.js";
import {
  createEmptyTierList,
  currentTierList,
  persistTierList,
  sendHero,
  tierUi
} from "./tier-list-view.js";

export function installTierListsActions() {
  installTierListsPicking();
  installTierListsEditing();
}

function installTierListsPicking() {
  onAction("create-tier-list", async () => {
    const created = await api("/api/tier-lists", {
      method: "POST",
      body: createEmptyTierList(state.tierLaneFilter)
    });
    await reloadTierLists();
    state.activeTierId = created.id;
    state.view = "tier-lists";
    tierUi.picked = null;
    tierUi.chosen = true;
    render();
  });

  onAction("tier-lane-filter", button => {
    state.tierLaneFilter = button.dataset.lane;
    state.activeTierId = null;
    Object.assign(tierUi, { picked: null, query: "", lane: "all", chosen: true });
    render();
  });

  // a list of the shelf at the top of the page
  onAction("select-tier-list", button => {
    state.activeTierId = button.dataset.tierId;
    Object.assign(tierUi, { picked: null, query: "", lane: "all", chosen: true });
    render();
  });

  // a hero picked with a click or a key: the bar then says where to send it
  onAction("tier-pick", button => {
    const heroId = button.dataset.heroId;
    tierUi.picked = tierUi.picked === heroId ? null : heroId;
    tierUi.focus = heroId;
    render();
  });

  onAction("tier-send", async button => {
    await sendHero(tierUi.picked, button.dataset.target);
  });

  onAction("tier-cancel", () => {
    tierUi.focus = tierUi.picked;
    tierUi.picked = null;
    render();
  });

  onAction("tier-reserve-lane", button => {
    tierUi.lane = button.dataset.lane;
    render();
    document.querySelector("#tier-reserve-search")?.focus({ preventScroll: true });
  });

  onAction("add-tier", async () => {
    const list = currentTierList();
    list.tiers.push({ id: id(), label: `T${list.tiers.length + 1}`, heroes: [] });
    await persistTierList(list);
    render();
  });
}

function installTierListsEditing() {
  onAction("remove-tier", async button => {
    const list = currentTierList();
    const index = list.tiers.findIndex(tier => tier.id === button.dataset.tierId);
    if (index >= 0) {
      list.unranked.push(...list.tiers[index].heroes);
      list.tiers.splice(index, 1);
      await persistTierList(list);
      render();
    }
  });

  onAction("move-tier", async button => {
    const list = currentTierList();
    const index = Number(button.dataset.tierIndex);
    const destination = index + Number(button.dataset.direction);
    if (destination >= 0 && destination < list.tiers.length) {
      [list.tiers[index], list.tiers[destination]] = [list.tiers[destination], list.tiers[index]];
      await persistTierList(list);
      render();
    }
  });

  onAction("delete-tier-list", async button => {
    if (confirm(t("Delete this tier list?"))) {
      await api(`/api/tier-lists/${encodeURIComponent(button.dataset.tierId)}`, {
        method: "DELETE"
      });
      await reloadTierLists();
      render();
    }
  });

  onAction("export-tier-list", () => {
    const list = currentTierList();
    downloadJson(`${safeFilename(list.name)}.json`, list);
  });

  onAction("import-tier-list", () => {
    document.querySelector("#tier-import-file").click();
  });

  onChange(
    event => event.target.id === "tier-list-name",
    async event => {
      const list = currentTierList();
      if (list) {
        list.name = event.target.value.trim() || t("Untitled tier list");
        event.target.value = list.name;
        const card = document.querySelector(".tl-card.is-active b");
        if (card) {
          card.textContent = list.name;
        }
        await persistTierList(list);
      }
    }
  );

  onChange(
    event => event.target.classList.contains("tier-name"),
    async event => {
      const list = currentTierList();
      const tier = list?.tiers.find(item => item.id === event.target.dataset.tierId);
      if (tier) {
        tier.label = event.target.value.trim() || t("Tier");
        recolourTier(event.target.closest(".tier-row"), tier.label);
        event.target.classList.toggle("is-m", tier.label.length > 3 && tier.label.length <= 6);
        event.target.classList.toggle("is-s", tier.label.length > 6);
        await persistTierList(list);
      }
    }
  );
}
