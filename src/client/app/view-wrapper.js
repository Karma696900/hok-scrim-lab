// Pages loaded on demand (community, training, welcome, settings) draw into their own wrapper.
// During start-up the server already drew that wrapper (data-ssr): it is kept and its content
// reconciled with the first draw instead of being replaced, so the painted heading and text stay
// the same nodes and the largest paint is not measured again once the script has run. After
// start-up: a fresh wrapper.
//
// A page whose data takes a while paints a FRAME first (`root.paintFrame(html)`): its title, its introduction and a
// skeleton. What it draws next is reconciled with the frame in the same way, so the title is the same node from the first
// paint to the last (it does not blink, and its entrance animation does not start again). The server draws exactly this
// frame for a person who is signed in (platform/http/prerender.js).
const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

/**
 * `hydration` is { active(): boolean, morph(element, html) } from app.js; without it (or after
 * start-up) the wrapper is simply replaced.
 */
export function pageRoot(app, hydration, id = "") {
  const drawn = hydration?.active() ? app.querySelector(":scope > div") : null;
  const root = drawn ?? document.createElement("div");
  if (id) {
    root.id = id;
  }
  if (!drawn) {
    app.replaceChildren(root);
  }
  // "reconcile": the next draw is morphed into what is there (the server's drawing, or the frame); then "replace"
  let next = drawn ? "reconcile" : "replace";
  Object.defineProperty(root, "innerHTML", {
    configurable: true,
    get() {
      return nativeInnerHtml.get.call(this);
    },
    set(html) {
      if (next === "reconcile" && hydration) {
        next = "replace";
        hydration.morph(this, html);
      } else {
        nativeInnerHtml.set.call(this, html);
      }
    }
  });
  /** Draws the frame of the page: what comes next is reconciled with it. */
  root.paintFrame = html => {
    root.innerHTML = html;
    if (hydration) {
      next = "reconcile";
    }
  };
  return root;
}
