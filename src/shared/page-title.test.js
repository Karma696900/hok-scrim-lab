import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SITE_NAME } from "./routes.js";
import { TITLE_ROOM, fitTitle } from "./page-title.js";

describe("the title a search engine shows", () => {
  test("a short title keeps the name of the site", () => {
    const title = `HOK Items | ${SITE_NAME}`;
    assert.equal(fitTitle(title), title);
  });

  test("a long title lets the name of the site go, so that its words are not cut", () => {
    const title = `Agudo build, skills and counters — HOK Honor of Kings | ${SITE_NAME}`;
    assert.equal(fitTitle(title), "Agudo build, skills and counters — HOK Honor of Kings");
  });

  test("a title without the name of the site is left as it is, however long", () => {
    const title = "x".repeat(TITLE_ROOM + 20);
    assert.equal(fitTitle(title), title);
  });

  test("the room is the one search engines show", () => {
    assert.equal(TITLE_ROOM, 60);
  });
});
