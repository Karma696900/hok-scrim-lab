// Camp's page can stop answering altogether (a starved machine, a throttled connection): each hero
// then costs the whole 30 s wait, and the sync would hold its lock for the 80 sheets behind it.

/**
 * Counts the heroes in a row that got no answer at all. `silent()` says what to do next:
 * "continue" with the same page, "reload" (open a fresh page, the old one is stuck), or "give-up"
 * (the next scheduled pass takes over). An answer, even an error, starts the count again.
 */
export function createStallGuard({ reloadAfter = 3, giveUpAfter = 9 } = {}) {
  let inARow = 0;
  return {
    answered() {
      inARow = 0;
    },
    silent() {
      inARow += 1;
      if (inARow >= giveUpAfter) {
        return "give-up";
      }
      return inARow % reloadAfter === 0 ? "reload" : "continue";
    }
  };
}

/** Playwright's wait for a response ran out of time: the page said nothing. */
export const isSilence = error => error?.name === "TimeoutError";
