// Keeping the roster up to date and editing a hero (administrators).
import { api } from "../../app/api-client.js";
import { applyHeroFilter, restoreHeroList, syncHeroDetails } from "./hero-list.js";
import { backgroundReady } from "../../app/stylesheet-loading.js";
import { debounce } from "../../lib/debounce.js";
import * as heroStats from "./hero-stats.js";
import { loadCatalog, openHero, paintAliases } from "./hero-sheet.js";
import { loadHeroEditor } from "../../app/lazy-pages.js";
import { onAction, onChange, onInput } from "../../app/event-actions.js";
import { reloadTierLists } from "../../app/roster-data.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { tell } from "../../lib/dom.js";

/** Where the index was when a sheet was opened from it: the way back puts the person there again. */
let listScroll = 0;

export function installRosterActions() {
  // Admin: fetch the roster again from Camp (one run at a time, with a cooldown, on the server).
  onAction("sync-roster", async button => {
    button.disabled = true;
    button.textContent = t("Syncing…");
    try {
      state.roster = await api("/api/roster/sync", { method: "POST", body: {} });
      state.heroes = state.roster.heroes;
      tell(t("Roster synced · {count} heroes", { count: state.heroes.length }));
      await reloadTierLists();
    } catch (error) {
      state.roster = await api("/api/heroes");
      state.heroes = state.roster.heroes;
      tell(t("Sync failed; cache retained. {message}", { message: error.message }));
    } finally {
      render();
    }
  });

  onAction("sync-details", async () => {
    await syncHeroDetails();
  });

  onAction("open-hero", async button => {
    if (state.view === "heroes") {
      listScroll = window.scrollY;
    }
    await openHero(button.dataset.heroId);
  });

  // The presentation video: the first frame is already there; the big button starts it (muted, with its controls).
  onAction("load-lore-video", button => {
    const video = button.closest(".hs-player")?.querySelector("video") ?? button.nextElementSibling;
    button.remove();
    video.hidden = false;
    video.controls = true;
    video.preload = "metadata";
    if (video.dataset.src) {
      video.src = video.dataset.src;
      delete video.dataset.src;
    }
    video.play().catch(() => {});
  });

  onAction(["bg-choose", "bg-random"], async (button, event, action) => {
    const background = await backgroundReady;
    if (background) {
      await (action === "bg-choose"
        ? background.choose(button.dataset.heroId)
        : background.random());
      tell(
        action === "bg-choose"
          ? t("This video is now the page background")
          : t("The background is random again")
      );
    }
  });

  onAction("close-hero", () => {
    state.view = "heroes";
    state.selectedHeroId = null;
    state.heroSheet = null;
    render();
    restoreHeroList(listScroll);
  });

  onAction("edit-hero-data", async () => {
    const [editor, catalog] = await Promise.all([loadHeroEditor(), loadCatalog(true)]);
    state.catalog = catalog;
    editor.open(
      state.heroSheet.hero,
      state.heroSheet.profile,
      catalog,
      state.heroSheet.details?.skills
    );
  });
}

export function installEditActions() {
  onAction(["add-hero-lane", "remove-hero-lane"], async (button, event, action) => {
    const heroId = encodeURIComponent(button.dataset.heroId);
    if (action === "add-hero-lane") {
      await api(`/api/admin/heroes/${heroId}/lanes`, {
        method: "POST",
        body: { lane: document.querySelector("#hero-lane-select")?.value }
      });
    } else {
      await api(`/api/admin/heroes/${heroId}/lanes/${encodeURIComponent(button.dataset.lane)}`, {
        method: "DELETE"
      });
    }
    state.roster = await api("/api/heroes");
    state.heroes = state.roster.heroes;
    await reloadTierLists(); // the tier lists of the lane gain or lose the hero (the server reads the hero's lanes)
    await openHero(button.dataset.heroId);
    tell(t("Lanes updated"));
  });

  // the other names of a hero (administrators): added with the form, taken away with the cross of a name
  onAction("remove-hero-alias", async button => {
    await api(
      `/api/admin/heroes/${encodeURIComponent(button.dataset.heroId)}/aliases/${encodeURIComponent(button.dataset.key)}`,
      { method: "DELETE" }
    );
    await paintAliases(button.dataset.heroId);
    tell(t("Names updated"));
  });
  document.addEventListener("submit", async event => {
    const form = event.target.closest?.(".hs-aliases__form");
    if (!form) {
      return;
    }
    event.preventDefault();
    const field = form.elements.alias;
    const alias = field.value.trim();
    if (!alias) {
      return;
    }
    try {
      await api(`/api/admin/heroes/${encodeURIComponent(form.dataset.heroId)}/aliases`, {
        method: "POST",
        body: { alias }
      });
    } catch (failure) {
      tell(failure.message);
      return;
    }
    await paintAliases(form.dataset.heroId);
    document.querySelector(".hs-aliases__form input")?.focus();
    tell(t("Names updated"));
  });

  // the text is kept at once (a click on a lane chip reads it), the 110 cards are only hidden and
  // shown once the typing pauses: 63 ms per letter on a phone-class processor otherwise
  const filterHeroes = debounce(applyHeroFilter, 120);
  onInput(
    event => event.target.id === "hero-search",
    event => {
      state.search = event.target.value;
      filterHeroes();
    }
  );

  onChange(
    event => event.target.matches("[data-stats-window]") || event.target.id === "stats-window-date",
    async () => {
      const kind = document.querySelector("#stats-window").value;
      const date = document.querySelector("#stats-window-date")?.value || "";
      if (kind === "from" && !date) {
        state.heroSheet = { ...state.heroSheet };
        heroStats.saveWindow({ kind, date: "" });
        render();
        return;
      }
      heroStats.saveWindow({ kind, date });
      const since = heroStats.sinceOf({ kind, date });
      const next = await api(
        `/api/heroes/${encodeURIComponent(state.selectedHeroId)}${since ? `?since=${since}` : ""}`
      );
      state.heroSheet = { ...state.heroSheet, tournament: next.tournament };
      render();
      document.querySelector("#stats-window")?.focus();
    }
  );
}
