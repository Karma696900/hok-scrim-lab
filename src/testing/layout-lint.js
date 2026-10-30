/* global document, window, getComputedStyle, NodeFilter */
// What can be told from a page without a pair of eyes: boxes that run out of the screen or of their parent, text that is
// cut, siblings that lie over each other, pictures that are squashed, targets too small to touch, text too small to read.
// `layoutProblems` runs IN the page (it is serialised: no outside reference) and returns a list of
// { kind, where, detail } objects. src/client/styles/layout-lint.e2e.mjs runs it on every page, in both themes, on a phone and on a
// desktop; it is not a replacement for looking at the pages, it keeps what was found from coming back.

/** Runs in the page. `options.phone`: the viewport is a phone (the touch targets are then measured). */
export function layoutProblems(options = {}) {
  // the cards under the first screen of a phone are not laid out until they are scrolled near (content-visibility): every box
  // is wanted here, so they are all laid out for the measure
  const everything = document.createElement("style");
  everything.textContent = "*, *::before, *::after { content-visibility: visible !important; }";
  document.head.append(everything);
  void document.body.offsetHeight;
  const found = [];
  const label = element => {
    const own =
      typeof element.className === "string"
        ? element.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
    return `${element.localName}${element.id ? `#${element.id}` : ""}${own ? `.${own}` : ""}`;
  };
  const words = element =>
    (element.getAttribute("aria-label") || element.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 28);
  const add = (kind, element, detail = "") => {
    if (found.length < 400) {
      found.push({ kind, where: label(element), text: words(element), detail });
    }
  };
  const visible = element => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  /** An element is drawn only when no ancestor hides it or clips it to nothing. */
  const shown = element => {
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      if (!visible(node) && node !== element) {
        return false;
      }
      if (node.hasAttribute("hidden") || node.closest("[inert]") === node) {
        return false;
      }
    }
    return visible(element);
  };
  const inScroller = element => {
    for (
      let node = element.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
        return node;
      }
    }
    return null;
  };
  const view = document.querySelector("#view") ?? document.body;
  const width = window.innerWidth;
  const elements = [...view.querySelectorAll("*")].filter(
    element =>
      // `i` is the number or the mark in a badge: it is drawn over its round box on purpose
      !["script", "style", "link", "meta", "template", "noscript", "option", "i"].includes(
        element.localName
      ) && !element.closest("svg, [aria-hidden='true'], .visually-hidden, dialog:not([open])")
  );

  // 1. an element that runs out of the screen on the sides (and is not inside something that scrolls)
  for (const element of elements) {
    if (!shown(element) || inScroller(element)) {
      continue;
    }
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (style.position === "fixed" || style.position === "sticky") {
      continue;
    }
    if (box.right > width + 2 || box.left < -2) {
      add(
        "outside-screen",
        element,
        `${Math.round(box.left)}..${Math.round(box.right)} of ${width}`
      );
    }
  }

  // 2. text that is cut: the box clips its content and there is no ellipsis to say so
  for (const element of elements) {
    if (!shown(element)) {
      continue;
    }
    const style = getComputedStyle(element);
    const clipsX = /(hidden|clip)/.test(style.overflowX);
    const clipsY = /(hidden|clip)/.test(style.overflowY);
    // a text that is one pixel wide is drawn away for the screen readers, not cut
    if (element.clientWidth <= 2 || element.clientHeight <= 2) {
      continue;
    }
    if (
      clipsX &&
      element.scrollWidth > element.clientWidth + 2 &&
      style.textOverflow !== "ellipsis" &&
      element.children.length === 0 &&
      element.textContent.trim()
    ) {
      add("text-cut", element, `${element.scrollWidth} wide in ${element.clientWidth}`);
    }
    if (
      clipsY &&
      element.scrollHeight > element.clientHeight + 3 &&
      element.children.length === 0 &&
      element.textContent.trim() &&
      style.display !== "inline" &&
      // a few lines then an ellipsis on purpose (the computed display of such a box is flow-root, the clamp is what tells)
      (style.webkitLineClamp ?? "none") === "none" &&
      !/-webkit-box/.test(style.display)
    ) {
      add("text-cut-height", element, `${element.scrollHeight} high in ${element.clientHeight}`);
    }
  }

  // 3. text that spills out of its parent box (a long word in a narrow cell)
  for (const element of elements) {
    if (
      !shown(element) ||
      inScroller(element) ||
      element.children.length > 0 ||
      !element.textContent.trim()
    ) {
      continue;
    }
    const parent = element.parentElement;
    // the label of a pin is written beside its pin, not inside it
    if (!parent || parent === view || element.closest(".map-pin")) {
      continue;
    }
    const box = element.getBoundingClientRect();
    const around = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    if (/(hidden|clip|auto|scroll)/.test(parentStyle.overflowX)) {
      continue;
    }
    if (box.right > around.right + 3 && getComputedStyle(element).display !== "inline") {
      add(
        "text-spills",
        element,
        `${Math.round(box.right - around.right)} px past its parent ${label(parent)}`
      );
    }
  }

  // 4. siblings that lie over each other (boxes in the normal flow whose rectangles cross by more than a few pixels)
  const flows = element => {
    const style = getComputedStyle(element);
    return (
      ["static", "relative"].includes(style.position) &&
      style.transform === "none" &&
      Number.parseFloat(style.marginTop) >= 0 &&
      Number.parseFloat(style.marginLeft) >= 0 &&
      style.float === "none"
    );
  };
  for (const parent of [view, ...elements]) {
    if (!shown(parent) || parent.children.length < 2 || parent.children.length > 60) {
      continue;
    }
    const children = [...parent.children].filter(
      child =>
        elements.includes(child) &&
        shown(child) &&
        flows(child) &&
        getComputedStyle(child).display !== "inline" &&
        getComputedStyle(child).display !== "contents"
    );
    // the cells of a table row and the faces of a stack of avatars lie side by side or over each other on purpose
    if (
      children.some(
        child => /^(td|th)$/.test(child.localName) || /face|avatar/.test(String(child.className))
      )
    ) {
      continue;
    }
    for (let a = 0; a < children.length; a += 1) {
      for (let b = a + 1; b < children.length; b += 1) {
        const first = children[a].getBoundingClientRect();
        const second = children[b].getBoundingClientRect();
        const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (
          overlapX > 6 &&
          overlapY > 6 &&
          first.width > 12 &&
          second.width > 12 &&
          first.height > 12 &&
          second.height > 12
        ) {
          add(
            "overlap",
            children[b],
            `with ${label(children[a])}: ${Math.round(overlapX)}x${Math.round(overlapY)} px`
          );
        }
      }
    }
  }

  // 5. pictures that are squashed or stretched
  for (const image of view.querySelectorAll("img")) {
    if (!shown(image) || !image.naturalWidth || !image.naturalHeight) {
      continue;
    }
    const style = getComputedStyle(image);
    if (["cover", "contain", "scale-down", "none"].includes(style.objectFit)) {
      continue;
    }
    const box = image.getBoundingClientRect();
    const natural = image.naturalWidth / image.naturalHeight;
    const drawn = box.width / box.height;
    if (Math.abs(drawn - natural) / natural > 0.08 && box.width > 16) {
      add("picture-distorted", image, `drawn ${drawn.toFixed(2)}, natural ${natural.toFixed(2)}`);
    }
  }

  // 6. targets too small to touch (phones; the links inside a sentence are not counted)
  if (options.phone) {
    for (const element of view.querySelectorAll(
      'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, [role="button"], [role="tab"]'
    )) {
      if (!shown(element) || element.disabled) {
        continue;
      }
      if (
        element.localName === "a" &&
        /^(p|li|span|small|em|b|strong|label)$/.test(element.parentElement?.localName ?? "") &&
        getComputedStyle(element).display === "inline"
      ) {
        continue;
      }
      // a field is the box around the input: that box is what a finger meets
      const box = (element.closest(".field") ?? element).getBoundingClientRect();
      if (box.width < 24 || box.height < 24) {
        add("small-target", element, `${Math.round(box.width)}x${Math.round(box.height)} px`);
      }
    }
  }

  // 7. text too small to read
  const smallText = new Set();
  const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      !parent ||
      !node.nodeValue.trim() ||
      !shown(parent) ||
      parent.closest("svg, .visually-hidden, [aria-hidden='true']")
    ) {
      continue;
    }
    const size = Number.parseFloat(getComputedStyle(parent).fontSize);
    if (size < 11 && !smallText.has(parent)) {
      smallText.add(parent);
      add("small-text", parent, `${size}px`);
    }
  }

  // 8. a box with a border or a background and nothing in it
  for (const element of elements) {
    if (
      !shown(element) ||
      element.children.length > 0 ||
      element.textContent.trim() ||
      [
        "img",
        "input",
        "textarea",
        "select",
        "button",
        "hr",
        "video",
        "canvas",
        "iframe",
        "i",
        "span",
        "b",
        "em",
        "svg",
        "progress",
        "meter",
        "label"
      ].includes(element.localName)
    ) {
      continue;
    }
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const framed =
      Number.parseFloat(style.borderTopWidth) > 0 ||
      (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundImage === "none");
    if (
      framed &&
      box.height > 40 &&
      box.width > 40 &&
      !element.matches(
        ".skeleton, .loading-line, [class*='skeleton'], [class*='art'], [class*='veil'], [class*='slot'], [class*='dot']"
      ) &&
      !style.backgroundImage.includes("url")
    ) {
      add("empty-box", element, `${Math.round(box.width)}x${Math.round(box.height)} px`);
    }
  }

  // 9. the whole page scrolls sideways
  if (document.documentElement.scrollWidth > width + 1) {
    found.push({
      kind: "page-scrolls-sideways",
      where: "html",
      text: "",
      detail: `${document.documentElement.scrollWidth - width} px`
    });
  }
  everything.remove();
  return found;
}
