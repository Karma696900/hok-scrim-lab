// The week of the calendar: how long each event is drawn, whatever the hour of the day the page is opened.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installFakeDom } from "../../../testing/fake-dom.js";

installFakeDom({ pathname: "/agenda" });
const { layoutDay } = await import("./agenda-views.js");

const at = (hour, minute = 0, day = 26) => Date.UTC(2026, 9, day, hour, minute);
const event = (id, startsAt, endsAt) => ({ id, kind: "scrim", startsAt, endsAt });
const drawn = events =>
  Object.fromEntries(layoutDay(events).map(item => [item.event.id, [item.start, item.end]]));

describe("layoutDay", () => {
  test("an event is drawn from its start to its end", () => {
    assert.deepEqual(drawn([event("a", at(19), at(21))]), { a: [19 * 60, 21 * 60] });
  });

  test("an event that ends at midnight is drawn to the end of the day, not as a short one", () => {
    assert.deepEqual(drawn([event("late", at(22), at(0, 0, 27))]), { late: [22 * 60, 24 * 60] });
  });

  test("an event that goes on after midnight is clipped to the end of the day", () => {
    assert.deepEqual(drawn([event("night", at(23), at(1, 0, 27))]), { night: [23 * 60, 24 * 60] });
  });

  test("an event shorter than half an hour is drawn half an hour long, so that its words fit", () => {
    assert.deepEqual(drawn([event("quick", at(18), at(18, 10))]), {
      quick: [18 * 60, 18 * 60 + 30]
    });
  });
});
