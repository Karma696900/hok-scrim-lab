import { matchRoute } from "../../shared/routes.js";

// The first paint uses the critical CSS inlined in the HTML. The full stylesheet is fetched without
// blocking it, and nothing is drawn into the page before it applies (no flash of unstyled content,
// no layout shift).
export const stylesReady = new Promise(resolve => {
  const link = document.querySelector("link[data-deferred-css]");
  if (!link) {
    return resolve();
  }
  if (link.sheet) {
    link.media = "all";
    return resolve();
  } // already downloaded while the page was parsing
  link.addEventListener("load", resolve, { once: true });
  link.addEventListener("error", resolve, { once: true });
  link.media = "all";
});

/**
 * The view the server drew as the first screen (a visitor's), or null. That page carries the CSS of
 * its first screen only (platform/http/first-paint.js): the rest of the stylesheet is not applied
 * until another page is drawn, so the first screen does not pay for the styles of the others. (The frame of a
 * signed-in person, data-ssr="frame", is not that: it is drawn before the person's data, which may need more of the
 * stylesheet than the frame does, so the page waits for the whole stylesheet before it draws them.)
 */
export const drawnView =
  document.getElementById("view")?.dataset.ssr === "1" ? matchRoute(location.pathname).view : null;

/**
 * What the server wrote for this page in the boot block (platform/http/first-paint.js), read once. For a person who is signed
 * in it carries `b`: the answers of /api/auth/me, /api/me/preferences and /api/community/summary, so that the page starts
 * with them instead of asking for them (platform/http/bootstrap.js).
 */
export const boot = (() => {
  try {
    return JSON.parse(document.getElementById("boot")?.textContent ?? "{}");
  } catch {
    return {};
  }
})();

/** One of the answers the server wrote into the page (`me`, `prefs`, `summary`), once: later asks go to the server. */
export function takeBootstrap(name) {
  const value = boot.b?.[name] ?? null;
  if (boot.b) {
    delete boot.b[name];
  }
  return value;
}

let whole = null;
/**
 * The whole stylesheet of a page the server drew (the boot script has prefetched it: `w` in the boot
 * block). Wanted before another view is drawn; fetched anyway after a while, for what a long visit
 * brings on screen. Resolves at once when there is nothing to load (the page has it already).
 */
export function wholeStylesheet() {
  whole ??= new Promise(resolve => {
    const address = boot.w ?? "";
    if (!address) {
      return resolve();
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = address;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    document.head.append(link);
  });
  return whole;
}

// The background video module is fetched at the first interaction (or when a hero page asks for
// it): never on the way to the first paint.
let backgroundPromise = null;

export const backgroundReady = {
  then: (...handlers) =>
    (backgroundPromise ??= import("../features/heroes/hero-background.js").then(
      module => module.createBackground(),
      () => null
    )).then(...handlers)
};

export function installPageLoad() {
  for (const name of ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"]) {
    addEventListener(name, () => void backgroundReady.then(() => {}), {
      capture: true,
      passive: true,
      once: true
    });
  }
  setTimeout(() => void wholeStylesheet(), 20000);
}
