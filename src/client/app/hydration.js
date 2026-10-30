import { app } from "../lib/dom.js";

// Hydration: the page the server drew (data-ssr) is reconciled with the first client render instead
// of being replaced, so the painted elements (heading, text) stay the same nodes and the largest
// paint is not re-measured once the script has run. Only during start-up.
let hydrating = Boolean(app.dataset.ssr);

function morphChildren(from, to) {
  const current = [...from.childNodes],
    wanted = [...to.childNodes];
  for (let index = 0; index < Math.max(current.length, wanted.length); index += 1) {
    const old = current[index],
      next = wanted[index];
    if (!next) {
      old.remove();
      continue;
    }
    if (!old) {
      from.append(next);
      continue;
    }
    if (old.nodeType !== next.nodeType || old.nodeName !== next.nodeName) {
      old.replaceWith(next);
      continue;
    }
    if (old.nodeType !== 1) {
      if (old.nodeValue !== next.nodeValue) {
        old.nodeValue = next.nodeValue;
      }
      continue;
    }
    if (old.isEqualNode(next)) {
      continue;
    }
    for (const attribute of [...old.attributes]) {
      if (!next.hasAttribute(attribute.name)) {
        old.removeAttribute(attribute.name);
      }
    }
    for (const attribute of next.attributes) {
      if (old.getAttribute(attribute.name) !== attribute.value) {
        old.setAttribute(attribute.name, attribute.value);
      }
    }
    morphChildren(old, next);
  }
}

/** What the pages loaded on demand need to keep the server-drawn markup (see hydrate.js). */
export const hydration = {
  active: () => hydrating,
  morph(element, html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    morphChildren(element, template.content);
  }
};

/**
 * Ends the start-up phase: from now on a render replaces the page instead of being reconciled with
 * the server's drawing.
 */
export function finishHydration() {
  hydrating = false;
}

const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");

export function installHydration() {
  Object.defineProperty(app, "innerHTML", {
    configurable: true,
    get() {
      return nativeInnerHtml.get.call(this);
    },
    set(html) {
      if (!hydrating) {
        nativeInnerHtml.set.call(this, html);
        return;
      }
      if (html.includes('class="loading-line"') && this.childElementCount > 1) {
        return;
      } // data still on its way: keep the drawn page instead of collapsing it
      const template = document.createElement("template");
      template.innerHTML = html;
      morphChildren(this, template.content);
    }
  });
}
