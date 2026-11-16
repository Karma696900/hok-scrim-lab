// A locked account says until when, in the person's own clock (owner, 2026-11-16: a player took the lock
// for a wrong code).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lockMessage } from "./forms.js";

const now = new Date(2026, 10, 16, 18, 10).getTime();

test("a lock that ends today gives the time", () => {
  const text = lockMessage(new Date(2026, 10, 16, 18, 42).getTime(), now);
  assert.match(text, /^Too many tries on this account\. You can try again at 6:42\sPM\.$/);
});

test("a lock that ends tomorrow gives the day too", () => {
  const text = lockMessage(new Date(2026, 10, 17, 9, 5).getTime(), now);
  assert.match(
    text,
    /^Too many tries on this account\. You can try again on Tuesday.*17.*9:05\sAM\.$/
  );
});

test("without a time (or a time already past) the general sentence is kept", () => {
  assert.equal(lockMessage(undefined, now), "");
  assert.equal(lockMessage(now - 1000, now), "");
});
