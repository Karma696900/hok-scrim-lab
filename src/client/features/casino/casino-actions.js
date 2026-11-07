// casino page, what happens on a click or a change: create a roulette, spin, respin the ticked lanes, ban the hero
// of a lane, put one back, edit the pools, copy the links. Every change sends the key (X-Casino-Key); a key the server
// refuses is dropped and the page turns into the spectator's view.
import { t } from "../../app/browser-i18n.js";
import { controlLink, forgetKey, saveKey } from "./casino-key.js";
import { readPools } from "./casino-pools.js";

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
  [...view.root.querySelectorAll('input[name="casino-lane"]:checked')].map(box => box.value);

// "All" or "None" on the heroes of one lane that the search shows
function tickLane(view, lane, on) {
  for (const box of view.root.querySelectorAll(`input[name="casino-pool"][data-lane="${lane}"]`)) {
    if (!box.closest("li")?.hidden) {
      box.checked = on;
    }
  }
}

const ACTIONS = {
  "casino-create": view => create(view),
  "casino-spin": view =>
    change(view, "/spin", "POST", { lanes: ["clash", "jungle", "mid", "farm", "roam"] }),
  "casino-respin": view => {
    const lanes = ticked(view);
    if (!lanes.length) {
      view.tell(t("Tick at least one lane to respin."));
      return null;
    }
    return change(view, "/spin", "POST", { lanes });
  },
  "casino-ban": (view, button) => change(view, "/ban", "POST", { lane: button.dataset.lane }),
  "casino-unban": (view, button) =>
    change(view, `/ban/${encodeURIComponent(button.dataset.hero)}`, "DELETE"),
  "casino-pools-save": (view, button) =>
    change(view, "/pools", "PUT", { pools: readPools(button.closest("form")) }),
  "casino-pool-all": (view, button) => tickLane(view, button.dataset.lane, true),
  "casino-pool-none": (view, button) => tickLane(view, button.dataset.lane, false),
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

/** The search box of the pools: only the heroes whose name holds what is typed stay shown. */
export function onChange(view, event) {
  if (event.target.name !== "casino-search") {
    return;
  }
  const wanted = event.target.value.trim().toLowerCase();
  for (const item of view.root.querySelectorAll(".casino-pool li")) {
    item.hidden = Boolean(wanted) && !item.dataset.name.includes(wanted);
  }
}
