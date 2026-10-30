import { icon } from "../../shared/icons.js";
import { deferredResponsive, responsive } from "../../shared/media.js";
import { t } from "../app/browser-i18n.js";
import { classLabel, laneIcons } from "../domain/lanes.js";
import { state } from "../app/app-state.js";
import { escapeHtml } from "./escape.js";

export const app = document.querySelector("#view");

// A page may not carry style attributes (the content policy forbids them), so the few values that
// come from data (the width of a bar, a share of a ring) travel as data-p and are written as the
// custom property --p through the style object, which the policy allows. This runs for everything
// that is added to the page, now and later.
function applyVars(root) {
  const nodes = root.matches?.("[data-p]") ? [root] : [];
  nodes.push(...(root.querySelectorAll?.("[data-p]") ?? []));
  for (const node of nodes) {
    node.style.setProperty("--p", node.dataset.p);
  }
}
applyVars(app);
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        applyVars(node);
      }
    }
  }
}).observe(app, { childList: true, subtree: true });

const toasts = document.querySelector("#toasts");

export const slotImage = hero =>
  hero.image
    ? `<img ${responsive(hero.image, 128, "120px")} alt="" loading="lazy" decoding="async">`
    : `<span class="image-fallback"></span>`;

export { escapeHtml };

/** A short message at the bottom of the page. Several can be on screen; each leaves by itself. */
export function tell(message, iconName = "check") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `${icon(iconName)}<span></span>`;
  toast.lastElementChild.textContent = message;
  toasts.append(toast);
  while (toasts.children.length > 3) {
    toasts.firstElementChild.remove();
  }
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 280);
  }, 2800);
}

export function id() {
  return crypto.randomUUID();
}

/**
 * What a hero card draws: the picture is square (128 px at the source) and covers a box that is 3:4, so it is drawn as wide
 * as the box is tall: a third more than the box is wide (shared/media.js asks for 160 and 320 px).
 */
const CARD_SIZES = "(min-width: 700px) 160px, 40vw";

/**
 * The picture of a hero. `decorative` when the name is already written next to it (the card of a hero):
 * the picture has no text of its own, so a screen reader does not say the name twice.
 */
export function imageMarkup(hero, className = "", eager = false, late = false, decorative = false) {
  if (!hero.image) {
    return decorative
      ? `<div class="${className} image-fallback" aria-hidden="true"></div>`
      : `<div class="${className} image-fallback" role="img" aria-label="${escapeHtml(hero.name)}"></div>`;
  }
  return `<img class="${className}" ${className === "detail-portrait" ? responsive(hero.image, 132, "132px") : (late ? deferredResponsive : responsive)(hero.image, 160, CARD_SIZES)} alt="${decorative ? "" : escapeHtml(hero.name)}" ${eager ? 'loading="eager" fetchpriority="high"' : late ? "" : 'loading="lazy"'} decoding="async">`;
}

export function heroCard(hero, options = {}) {
  const {
    disabled = false,
    stateLabel = "",
    action = "open-hero",
    eager = false,
    late = false,
    lanes = true
  } = options;
  // `lanes: false`: the page that lists the heroes by lane does not repeat it on every card
  const laneIconsOf = !lanes
    ? ""
    : hero.lanes?.length
      ? laneIcons(hero.lanes, escapeHtml)
      : escapeHtml(t("Role not listed"));
  const role = hero.roles?.[0] ? classLabel(hero.roles[0]) : t("Global");
  return `<button class="hero-card${disabled ? " disabled" : ""}" data-action="${action}" data-hero-id="${escapeHtml(hero.id)}" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(hero.name)}${disabled ? `, ${t("unavailable")}` : ""}">
    ${imageMarkup(hero, "", eager, late, true)}<span class="hero-card-copy"><span class="hero-card-name">${escapeHtml(hero.name)}</span><span class="hero-card-meta"><span class="hero-card-lanes">${laneIconsOf}</span><span>${escapeHtml(role)}</span></span></span>${stateLabel ? `<span class="hero-card-state">${escapeHtml(stateLabel)}</span>` : ""}</button>`;
}

/** The roster note under a page heading: the cache that is used, or a roster that is missing. */
export function dataNotice() {
  const note = message =>
    `<div class="note note--warn">${icon("warn", "i--sm")}<span>${message}</span></div>`;
  if (state.roster?.heroes?.length) {
    return state.roster.usingCache
      ? note(
          t("Using the last validated roster cache · Source sync: {date}", {
            date: escapeHtml(state.roster.sourceUpdated || t("unknown"))
          })
        )
      : "";
  }
  return note(
    t(
      "No validated Global hero roster is cached yet. Synchronize the official Camp data to load the draft pool."
    )
  );
}

export function dataUnavailable(reason) {
  return `<div class="note note--warn">${icon("info")}<div><b>${t("Data unavailable")}</b>${escapeHtml(reason)}</div></div>`;
}

export function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function safeFilename(value) {
  return (
    String(value)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_|_$/g, "") || "scrim"
  );
}

// Camp's videos are heavy (the profile video alone starts at several MB): they are only requested
// when they come near the screen. The same observer wakes the pictures of the cards that were added
// after the first screenful.
let videoObserver = null;

export function watchVideos(root) {
  const videos = root.querySelectorAll("video[data-src]:not([data-on-demand]), img[data-src]");
  if (!videos.length) {
    return;
  }
  videoObserver ??= new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const video = entry.target;
        videoObserver.unobserve(video);
        if (video.dataset.srcset) {
          video.srcset = video.dataset.srcset;
          delete video.dataset.srcset;
        }
        if (video.dataset.src) {
          if (video.localName === "video") {
            video.preload = "metadata";
          }
          video.src = video.dataset.src;
          delete video.dataset.src;
        }
      }
    },
    { rootMargin: "300px 0px" }
  );
  for (const video of videos) {
    videoObserver.observe(video);
  }
}
