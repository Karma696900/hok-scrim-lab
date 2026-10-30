// hero background, small helpers: load, remove, show, paintToggle.
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { PICK, canPlay, lowData, read, reduced } from "./hero-background-shared.js";

export const load = async view =>
  (view.items ??= await fetch("/api/backgrounds")
    .then(response => (response.ok ? response.json() : { items: [] }))
    .then(data => data.items)
    .catch(() => []));

export function remove(view) {
  view.stage?.remove();
  view.stage = null;
  view.video = null;
  document.documentElement.classList.remove("has-bg");
}

export async function show(view) {
  // a reflex exercise is running: nothing is fetched or started until it is over (hok:quiet)
  if (state.quiet) {
    return;
  }
  const choice = read();
  if (choice === "off" || !canPlay()) {
    return view.remove();
  }
  const pool = await view.load();
  if (state.quiet) {
    return;
  }
  if (!pool.length) {
    return view.remove();
  }
  let pick = pool.find(item => item.heroId === choice);
  if (!pick) {
    let remembered = null;
    try {
      remembered = sessionStorage.getItem(PICK);
    } catch {
      /* ignore */
    }
    pick =
      pool.find(item => item.heroId === remembered) ??
      pool[Math.floor(Math.random() * pool.length)];
    try {
      sessionStorage.setItem(PICK, pick.heroId);
    } catch {
      /* ignore */
    }
  }
  if (view.video?.dataset.hero === pick.heroId) {
    return;
  }
  view.remove();
  view.stage = document.createElement("div");
  view.stage.className = "bg-stage";
  view.stage.setAttribute("aria-hidden", "true");
  view.video = document.createElement("video");
  Object.assign(view.video, {
    muted: true,
    loop: true,
    playsInline: true,
    autoplay: true,
    preload: "auto",
    disablePictureInPicture: true
  });
  view.video.dataset.hero = pick.heroId;
  view.video.setAttribute("tabindex", "-1");
  view.video.addEventListener("playing", () => document.documentElement.classList.add("has-bg"), {
    once: true
  });
  view.video.addEventListener("error", view.remove, { once: true });
  view.video.src = pick.video;
  view.stage.append(view.video);
  document.body.prepend(view.stage);
  view.video.play?.().catch(() => {});
}

export function paintToggle(view) {
  if (!view.toggle) {
    return;
  }
  const off = read() === "off";
  view.toggle.setAttribute("aria-pressed", String(!off));
  const label = off ? t("Background video: off") : t("Background video: on");
  view.toggle.setAttribute("aria-label", label);
  view.toggle.title = label;
  if (reduced() || lowData() || !matchMedia("(min-width: 900px)").matches) {
    view.toggle.dataset.unavailable = "";
  } else {
    delete view.toggle.dataset.unavailable;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { load, remove, show, paintToggle };
