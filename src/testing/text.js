// The text of an element as the page holds it, not as the stylesheet draws it: headings, buttons and tabs are
// written in capitals by CSS (`text-transform`), and `innerText` follows that. Whitespace is made single.

/** The text content of the first element matching `selector`, spaces collapsed. */
export const textOf = (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate(element => element.textContent.replace(/\s+/g, " ").trim());
