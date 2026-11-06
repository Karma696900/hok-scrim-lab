// The writes a frame makes only when what they show changes: a text or a "hidden" flag written again to the same value
// still counts as a change of the page, and with the site's :has() rules the browser then looks over the whole page.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setHidden, setText } from "./simulation-shared.js";

// an element that counts its writes
function counted(text = "", hidden = false) {
  const element = { writes: 0, _text: text, _hidden: hidden };
  Object.defineProperty(element, "textContent", {
    get: () => element._text,
    set: value => {
      element.writes += 1;
      element._text = value;
    }
  });
  Object.defineProperty(element, "hidden", {
    get: () => element._hidden,
    set: value => {
      element.writes += 1;
      element._hidden = value;
    }
  });
  return element;
}

test("a text is written only when it changes", () => {
  const level = counted("3");
  setText(level, 3);
  assert.equal(level.writes, 0);
  setText(level, 4);
  assert.equal(level.textContent, "4");
  assert.equal(level.writes, 1);
});

test("a hidden flag is written only when it changes", () => {
  const timer = counted("", true);
  setHidden(timer, true);
  assert.equal(timer.writes, 0);
  setHidden(timer, false);
  assert.equal(timer.hidden, false);
  assert.equal(timer.writes, 1);
});

test("a missing element is left alone", () => {
  assert.doesNotThrow(() => {
    setText(null, "1");
    setHidden(undefined, true);
  });
});
