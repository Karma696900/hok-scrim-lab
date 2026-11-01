// The game simulation on a phone: full screen at the start of a game, turned sideways, a button to go back to full
// screen when the player left it, and the normal page again when the game is left.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { coverWanted, enterFullscreen, exitFullscreen } from "./simulation-fullscreen.js";

function fakeScreen({ touch = true, enabled = true, lockFails = false, prefixed = false } = {}) {
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: {},
    exitFullscreen: async () => {
      calls.push("exit");
      doc.fullscreenElement = null;
    }
  };
  const ask = async options => {
    calls.push(["enter", options]);
    doc.fullscreenElement = doc.documentElement;
  };
  if (prefixed) {
    doc.webkitFullscreenEnabled = enabled;
    doc.documentElement.webkitRequestFullscreen = ask;
  } else {
    doc.fullscreenEnabled = enabled;
    doc.documentElement.requestFullscreen = ask;
  }
  const win = {
    matchMedia: query => ({ matches: touch && query === "(pointer: coarse)" }),
    screen: {
      orientation: {
        lock: async kind => {
          calls.push(["lock", kind]);
          if (lockFails) {
            throw new Error("not allowed");
          }
        },
        unlock: () => calls.push("unlock")
      }
    }
  };
  return { doc, win, calls };
}

describe("the simulation in full screen", () => {
  test("on a touch screen, the start asks for the whole screen without the browser's bars, then sideways", async () => {
    const { doc, win, calls } = fakeScreen();
    assert.equal(await enterFullscreen(doc, win), true);
    assert.deepEqual(calls, [
      ["enter", { navigationUI: "hide" }],
      ["lock", "landscape"]
    ]);
  });

  test("a browser that only knows the webkit names (iPad Safari) goes full screen too", async () => {
    const { doc, win, calls } = fakeScreen({ prefixed: true });
    assert.equal(await enterFullscreen(doc, win), true);
    assert.deepEqual(calls[0], ["enter", { navigationUI: "hide" }]);
  });

  test("with a mouse, or a browser without full screen, nothing is asked", async () => {
    for (const setting of [{ touch: false }, { enabled: false }]) {
      const { doc, win, calls } = fakeScreen(setting);
      assert.equal(await enterFullscreen(doc, win), false);
      assert.deepEqual(calls, []);
    }
  });

  test("a screen that cannot be turned stays in full screen", async () => {
    const { doc, win } = fakeScreen({ lockFails: true });
    assert.equal(await enterFullscreen(doc, win), true);
    assert.equal(doc.fullscreenElement, doc.documentElement);
  });

  test("a refused full screen is not an error, and already in full screen nothing is asked again", async () => {
    const refused = fakeScreen();
    refused.doc.documentElement.requestFullscreen = async () => {
      throw new Error("not a user gesture");
    };
    assert.equal(await enterFullscreen(refused.doc, refused.win), false);
    const already = fakeScreen();
    already.doc.fullscreenElement = already.doc.documentElement;
    assert.equal(await enterFullscreen(already.doc, already.win), true);
    assert.deepEqual(already.calls, []);
  });

  test("leaving the game gives the normal page back, and does nothing when it was not in full screen", async () => {
    const { doc, win, calls } = fakeScreen();
    await enterFullscreen(doc, win);
    await exitFullscreen(doc, win);
    assert.deepEqual(calls.slice(2), ["unlock", "exit"]);
    assert.equal(doc.fullscreenElement, null);
    calls.length = 0;
    await exitFullscreen(doc, win);
    assert.deepEqual(calls, []);
  });

  test("the button back to full screen shows only on a touch screen, out of full screen, while the game goes on", () => {
    const { doc, win } = fakeScreen();
    const playing = { stopped: false, ended: false };
    assert.equal(coverWanted(playing, doc, win), true);
    doc.fullscreenElement = doc.documentElement;
    assert.equal(coverWanted(playing, doc, win), false);
    doc.fullscreenElement = null;
    assert.equal(coverWanted({ stopped: false, ended: true }, doc, win), false);
    assert.equal(coverWanted({ stopped: true, ended: false }, doc, win), false);
    const mouse = fakeScreen({ touch: false });
    assert.equal(coverWanted(playing, mouse.doc, mouse.win), false);
  });
});
