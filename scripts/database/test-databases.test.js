// The tool that drops the databases left behind by killed test runs: it must never reach anything
// else, and must keep a database that may still be in use.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_YOUNGER_THAN_MINUTES, TEST_DATABASE, judge } from "./drop-test-databases.mjs";

const MINUTE = 60_000;
const now = Date.UTC(2026, 9, 7, 6, 0, 0);
const database = (name, extra = {}) => ({
  name,
  createdAt: now - 60 * MINUTE,
  connections: 0,
  ...extra
});
const verdict = (databases, options = {}) =>
  Object.fromEntries(judge(databases, { now, ...options }).map(item => [item.name, item]));

describe("what counts as a test database", () => {
  test("only the exact shape the tests give: hok_test_ and twelve hex digits", () => {
    assert.ok(TEST_DATABASE.test("hok_test_02466a78d3c6"));
    for (const name of [
      "hok_scrim",
      "hok_test_",
      "hok_test_02466a78d3c",
      "hok_test_02466a78d3c6x",
      "hok_test_02466A78D3C6",
      "hok_test_02466a78d3c6; DROP DATABASE hok_scrim",
      "xhok_test_02466a78d3c6",
      "hok_testing_02466a78d3c6",
      "mysql",
      "sys"
    ]) {
      assert.ok(!TEST_DATABASE.test(name), name);
    }
  });
});

describe("which databases may go", () => {
  test("one that was left behind goes: old enough, nobody connected", () => {
    assert.equal(verdict([database("hok_test_02466a78d3c6")]).hok_test_02466a78d3c6.drop, true);
  });

  test("the development database and anything else is kept, however old and unused", () => {
    const answers = verdict([
      database("hok_scrim", { createdAt: now - 9_999 * MINUTE }),
      database("mysql"),
      database("hok_test_02466a78d3c6x")
    ]);
    for (const item of Object.values(answers)) {
      assert.equal(item.drop, false, item.name);
      assert.equal(item.why, "not a test database");
    }
  });

  test("one somebody is connected to is kept (a run is using it)", () => {
    const answers = verdict([database("hok_test_02466a78d3c6", { connections: 2 })]);
    assert.deepEqual(
      [answers.hok_test_02466a78d3c6.drop, answers.hok_test_02466a78d3c6.why],
      [false, "in use"]
    );
  });

  test("a young one is kept, an empty one too (a run may be starting), unless age is not asked", () => {
    assert.equal(DEFAULT_YOUNGER_THAN_MINUTES, 10);
    const young = database("hok_test_aaaaaaaaaaaa", { createdAt: now - 3 * MINUTE });
    const edge = database("hok_test_bbbbbbbbbbbb", { createdAt: now - 10 * MINUTE });
    const old = database("hok_test_cccccccccccc", { createdAt: now - 11 * MINUTE });
    const empty = database("hok_test_dddddddddddd", { createdAt: null });
    const answers = verdict([young, edge, old, empty]);
    assert.deepEqual(
      [young, edge, old, empty].map(item => answers[item.name].drop),
      [false, true, true, false],
      "ten minutes old is not younger than ten minutes"
    );
    assert.equal(answers.hok_test_aaaaaaaaaaaa.why, "too young to be sure");
    const anyAge = verdict([young, empty], { youngerThanMinutes: 0 });
    assert.deepEqual(
      [anyAge.hok_test_aaaaaaaaaaaa.drop, anyAge.hok_test_dddddddddddd.drop],
      [true, true]
    );
    assert.equal(
      verdict([database("hok_test_eeeeeeeeeeee", { connections: 1, createdAt: null })], {
        youngerThanMinutes: 0
      }).hok_test_eeeeeeeeeeee.drop,
      false,
      "even without the age rule, a connection protects a database"
    );
  });
});
