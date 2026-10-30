// translations, small helpers: loadStatus, loadList, run, textOf, and 1 more.
import { forgetContent } from "../../domain/staff-content.js";

export async function loadStatus(page) {
  page.status = await page.api("/api/admin/translations/status");
}

export async function loadList(page) {
  const query = new URLSearchParams({
    language: page.view.language,
    state: page.view.state,
    q: page.view.search,
    page: String(page.view.page)
  });
  page.list = await page.api(`/api/admin/translations/texts?${query}`);
}

// ---- events -----------------------------------------------------------------------------------------

export async function run(page, work, repaint, done) {
  page.busy = true;
  try {
    await work();
    if (done) {
      page.tell(done);
    }
    await Promise.all([page.loadStatus(), page.loadList()]);
    forgetContent();
  } catch (error) {
    page.tell(error.message);
  } finally {
    page.busy = false;
    repaint();
    page.poll(repaint);
  }
}

export const textOf = (root, hash) =>
  root.querySelector(`[data-tr-text="${CSS.escape(hash)}"]`)?.value ?? "";

/** The number of texts that wait for a person or for the next round, for the badge of the tab. */
export const waiting = page =>
  page.status ? page.status.total.failed + page.status.total.pending : 0;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { loadStatus, loadList, run, waiting };
