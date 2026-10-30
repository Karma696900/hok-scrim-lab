// translations, loading polling: load, poll, stop.
import { forgetContent } from "../../domain/staff-content.js";

// ---- loading and polling -------------------------------------------------------------------------

/** Reads the state and the texts of the language; `repaint` draws the panel again. */
export async function load(page, repaint) {
  await Promise.all([page.loadStatus(), page.loadList()]);
  repaint();
  page.poll(repaint);
}

/** While a round runs, the state is asked for again every few seconds (and the texts when it ends). */
export function poll(page, repaint) {
  clearTimeout(page.timer);
  if (!page.status?.running) {
    return;
  }
  page.timer = setTimeout(async () => {
    try {
      await page.loadStatus();
      if (page.status.running) {
        repaint({ onlyStatus: true });
        page.poll(repaint);
      } else {
        await page.loadList();
        forgetContent();
        repaint();
      }
    } catch {
      /* the page was left, or the network blinked: the next click reads again */
    }
  }, 2500);
}

export function stop(page) {
  clearTimeout(page.timer);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { load, poll, stop };
