// The creator of a roulette is the browser that holds its key: kept in this browser, carried to another device by the
// control link (after `#`, never sent to the server), kept in memory when the browser refuses storage.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { controlLink, forgetKey, readKey, saveKey, takeKeyFromHash } from "./casino-key.js";

const memoryStorage = () => {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key)
  };
};

describe("the creator's key", () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });

  test("a key saved for a roulette is read back, and only for that roulette", () => {
    saveKey("Ab3dE5gH9k", "secret");
    assert.equal(readKey("Ab3dE5gH9k"), "secret");
    assert.equal(readKey("Zz9yX8wV7u"), null);
    forgetKey("Ab3dE5gH9k");
    assert.equal(readKey("Ab3dE5gH9k"), null);
  });

  test("the control link's key is kept and taken out of the address", () => {
    const calls = [];
    const location = {
      hash: "#key=abc_DEF-1234567890abcdefghijklmnopqrstuvwxy",
      pathname: "/casino/Ab3dE5gH9k",
      search: ""
    };
    const history = { state: null, replaceState: (...args) => calls.push(args) };
    assert.equal(
      takeKeyFromHash("Ab3dE5gH9k", location, history),
      "abc_DEF-1234567890abcdefghijklmnopqrstuvwxy"
    );
    assert.equal(readKey("Ab3dE5gH9k"), "abc_DEF-1234567890abcdefghijklmnopqrstuvwxy");
    assert.deepEqual(calls, [[null, "", "/casino/Ab3dE5gH9k"]]);
  });

  test("an address with no key leaves everything as it is", () => {
    const calls = [];
    const history = { replaceState: (...args) => calls.push(args) };
    assert.equal(
      takeKeyFromHash("Ab3dE5gH9k", { hash: "", pathname: "/casino/Ab3dE5gH9k" }, history),
      null
    );
    assert.equal(takeKeyFromHash("Ab3dE5gH9k", { hash: "#top", pathname: "/x" }, history), null);
    assert.deepEqual(calls, []);
  });

  test("the key lives in memory when storage refuses", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      }
    };
    saveKey("Qq1wE2rT3y", "kept");
    assert.equal(readKey("Qq1wE2rT3y"), "kept");
  });

  test("the control link carries the key after #", () => {
    assert.equal(
      controlLink("Ab3dE5gH9k", "k-1", "https://hok-scrim-lab.com"),
      "https://hok-scrim-lab.com/casino/Ab3dE5gH9k#key=k-1"
    );
  });
});
