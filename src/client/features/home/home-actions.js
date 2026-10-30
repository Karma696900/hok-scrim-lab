import { onAction } from "../../app/event-actions.js";
import { app } from "../../lib/dom.js";
import { state } from "../../app/app-state.js";
import { heroRail, homeList } from "./home-view.js";

// The overview: the tabs of the series list, the slides of the banner, and the countdown.

let timer = 0;
let ticker = 0;

const calm = () =>
  document.documentElement.classList.contains("reduce-motion") ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shows slide `index` of the banner: the others leave, and are taken out of the tab order. */
function showSlide(banner, index) {
  const slides = [...banner.querySelectorAll(".hello__slide")];
  const next = (index + slides.length) % slides.length;
  slides.forEach((slide, at) => {
    slide.classList.toggle("is-on", at === next);
    slide.toggleAttribute("inert", at !== next);
  });
  banner.querySelectorAll(".dots button").forEach((dot, at) => {
    dot.classList.toggle("on", at === next);
    if (at === next) {
      dot.setAttribute("aria-current", "true");
    } else {
      dot.removeAttribute("aria-current");
    }
  });
  banner.dataset.current = String(next);
}

/** The banner turns by itself every few seconds, unless the person hovers it or prefers calm. */
export function startBanner() {
  clearInterval(timer);
  clearInterval(ticker);
  const banner = app.querySelector("#hello");
  if (!banner) {
    return;
  }
  banner.dataset.current = "0";
  if (banner.querySelectorAll(".hello__slide").length > 1 && !calm()) {
    let paused = false;
    banner.addEventListener("pointerenter", () => (paused = true));
    banner.addEventListener("pointerleave", () => (paused = false));
    banner.addEventListener("focusin", () => (paused = true));
    banner.addEventListener("focusout", () => (paused = false));
    timer = setInterval(() => {
      if (!banner.isConnected) {
        clearInterval(timer);
      } else if (!paused && document.visibilityState === "visible") {
        showSlide(banner, Number(banner.dataset.current) + 1);
      }
    }, 7000);
  }
  // "in 2 hours" gets younger while the page is open.
  ticker = setInterval(() => {
    if (!banner.isConnected) {
      clearInterval(ticker);
      return;
    }
    for (const node of banner.querySelectorAll("[data-countdown]")) {
      const distance = Number(node.dataset.countdown) - Date.now();
      if (distance > 0) {
        node.textContent = new Intl.RelativeTimeFormat(document.documentElement.lang, {
          numeric: "auto"
        }).format(
          distance >= 3600_000 ? Math.round(distance / 3600_000) : Math.round(distance / 60000),
          distance >= 3600_000 ? "hour" : "minute"
        );
      }
    }
  }, 30000);
}

export function installHome() {
  onAction("home-tab", button => {
    state.homeTab = button.dataset.tab;
    for (const tab of app.querySelectorAll('[data-action="home-tab"]')) {
      const on = tab === button;
      tab.classList.toggle("on", on);
      tab.setAttribute("aria-selected", String(on));
    }
    app.querySelector("#home-list").innerHTML = homeList(state.homeTab);
  });

  // the lanes of the heroes rail on the overview
  onAction("home-lane", button => {
    for (const tab of app.querySelectorAll('[data-action="home-lane"]')) {
      tab.classList.toggle("on", tab === button);
      tab.setAttribute("aria-pressed", String(tab === button));
    }
    app.querySelector("#hero-rail").innerHTML = heroRail(button.dataset.lane);
  });

  document.addEventListener("click", event => {
    const step = event.target.closest("[data-hello]");
    if (step) {
      const banner = step.closest("#hello");
      showSlide(banner, Number(banner.dataset.current) + Number(step.dataset.hello));
    }
    const dot = event.target.closest("[data-hello-to]");
    if (dot) {
      showSlide(dot.closest("#hello"), Number(dot.dataset.helloTo));
    }
  });

  // On a touch screen the arrows are not there: a swipe on the banner turns it (the way the words read).
  let swipeFrom = null;
  document.addEventListener("pointerdown", event => {
    swipeFrom =
      event.pointerType === "touch" && event.target.closest("#hello")
        ? { x: event.clientX, y: event.clientY }
        : null;
  });
  document.addEventListener("pointerup", event => {
    const banner = swipeFrom && event.target.closest("#hello");
    if (banner) {
      const dx = event.clientX - swipeFrom.x;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(event.clientY - swipeFrom.y) * 1.5) {
        const forward = dx < 0 === (document.documentElement.dir !== "rtl");
        showSlide(banner, Number(banner.dataset.current) + (forward ? 1 : -1));
      }
    }
    swipeFrom = null;
  });
}
