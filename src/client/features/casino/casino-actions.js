// casino page, what happens on a click or a change: create a roulette, spin, respin the chosen lanes, ban the hero
// of a lane, put one back, edit the pools (saved by themselves), keep a composition in the basket, copy the links. Every change sends the key (X-Casino-Key); a key the server
// refuses is dropped and the page turns into the spectator's view.
import { t } from "../../app/browser-i18n.js";
import { controlLink, forgetKey, saveKey } from "./casino-key.js";
import { readPools } from "./casino-pools.js";
import { addToBasket } from "./casino-basket.js";
import { basketChanged, openBasket } from "./casino-basket-panel.js";

const SAVE_AFTER_MS = 700;

const path = (view, end = "") => `/api/casino/${encodeURIComponent(view.id)}${end}`;

// one change of the roulette, as its creator
async function change(view, end, method, body) {
  try {
    const roll = await view.api(path(view, end), {
      method,
      headers: { "X-Casino-Key": view.key ?? "" },
      ...(body === undefined ? {} : { body })
    });
    view.take(roll);
  } catch (error) {
    if (error.status === 403) {
      forgetKey(view.id);
      view.key = null;
      view.paint();
      view.tell(t("This control link is not valid."));
      return;
    }
    view.tell(error.message);
  }
}

async function create(view) {
  try {
    const made = await view.api("/api/casino", { method: "POST", body: {} });
    saveKey(made.id, made.key);
    view.go(`/casino/${made.id}`);
  } catch (error) {
    view.tell(error.message);
  }
}

async function copy(view, text) {
  try {
    await navigator.clipboard.writeText(text);
    view.tell(t("Link copied."));
  } catch {
    view.tell(text);
  }
}

const ticked = view =>
  [...view.root.querySelectorAll('[data-action="casino-lane-toggle"][aria-pressed="true"]')].map(
    button => button.dataset.lane
  );

const flip = button =>
  button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));

const status = (view, text) => {
  const box = view.root.querySelector("[data-pools-status]");
  if (box) {
    box.textContent = text;
  }
};

// the pools are saved by themselves a moment after the last click (owner, 2026-11-07: no Save button)
function poolsChanged(view) {
  for (const count of view.root.querySelectorAll("[data-pool-count]")) {
    const lane = count.dataset.poolCount;
    count.textContent = String(
      view.root.querySelectorAll(
        `[data-action="casino-pool-toggle"][data-lane="${lane}"][aria-pressed="true"]`
      ).length
    );
  }
  view.pendingPools = readPools(view.root);
  status(view, t("Saving…"));
  clearTimeout(view.saveTimer);
  view.saveTimer = setTimeout(() => savePools(view), SAVE_AFTER_MS);
}

async function savePools(view) {
  const pools = view.pendingPools;
  if (!pools) {
    return;
  }
  try {
    const roll = await view.api(path(view, "/pools"), {
      method: "PUT",
      headers: { "X-Casino-Key": view.key ?? "" },
      body: { pools }
    });
    if (view.pendingPools === pools) {
      view.pendingPools = null;
      // the pools on screen are already these: no new drawing, the search and the scroll stay
      view.roll = roll;
      status(view, t("Saved"));
    }
  } catch (error) {
    if (error.status === 403) {
      view.pendingPools = null;
      forgetKey(view.id);
      view.key = null;
      view.paint();
      view.tell(t("This control link is not valid."));
      return;
    }
    status(view, "");
    view.tell(error.message);
  }
}

// "All" or "None" on the heroes of one lane that the search does not dim
function pressLane(view, lane, on) {
  for (const pick of view.root.querySelectorAll(
    `[data-action="casino-pool-toggle"][data-lane="${lane}"]`
  )) {
    if (!pick.closest("li")?.classList.contains("is-dim")) {
      pick.setAttribute("aria-pressed", String(on));
    }
  }
  poolsChanged(view);
}

function keep(view) {
  const added = addToBasket(view.roll?.result);
  if (!added.ok) {
    view.tell(
      added.reason === "full"
        ? t("The basket is full ({max} compositions).", { max: 50 })
        : t("Spin first: there is no hero to keep yet.")
    );
    return;
  }
  basketChanged(view);
  view.tell(t("Added to the basket ({count}).", { count: added.count }));
}

const ACTIONS = {
  "casino-create": view => create(view),
  "casino-spin": view =>
    change(view, "/spin", "POST", { lanes: ["clash", "jungle", "mid", "farm", "roam"] }),
  "casino-respin": view => {
    const lanes = ticked(view);
    if (!lanes.length) {
      view.tell(t("Choose at least one lane to respin."));
      return null;
    }
    return change(view, "/spin", "POST", { lanes });
  },
  "casino-ban": (view, button) => change(view, "/ban", "POST", { lane: button.dataset.lane }),
  "casino-unban": (view, button) =>
    change(view, `/ban/${encodeURIComponent(button.dataset.hero)}`, "DELETE"),
  "casino-lane-toggle": (view, button) => flip(button),
  "casino-pool-toggle": (view, button) => {
    flip(button);
    poolsChanged(view);
  },
  "casino-pool-all": (view, button) => pressLane(view, button.dataset.lane, true),
  "casino-pool-none": (view, button) => pressLane(view, button.dataset.lane, false),
  "casino-basket-add": view => keep(view),
  "casino-basket-open": view => openBasket(view),
  "casino-copy-link": view => copy(view, `${location.origin}/casino/${view.id}`),
  "casino-copy-control": view => copy(view, controlLink(view.id, view.key))
};

export async function onAction(view, event) {
  const button = event.target.closest("[data-action]");
  const run = button && view.root.contains(button) && ACTIONS[button.dataset.action];
  if (!run) {
    return;
  }
  button.disabled = true;
  try {
    await run(view, button);
  } finally {
    button.disabled = false;
  }
}

/** Dims the avatars of the pools whose hero's name does not hold `wanted`. */
export function searchPools(view, wanted) {
  for (const item of view.root.querySelectorAll(".casino-pool__heroes li")) {
    item.classList.toggle("is-dim", Boolean(wanted) && !item.dataset.name.includes(wanted));
  }
}

/** The search box of the pools. */
export function onChange(view, event) {
  if (event.target.name !== "casino-search") {
    return;
  }
  view.search = event.target.value.trim().toLowerCase();
  searchPools(view, view.search);
}
