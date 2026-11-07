// Browser tests: choosing a hero in a hero picker (src/client/shell/hero-picker.js), as a person does: open the
// field, click the hero's avatar in the panel.

/** Picks `heroId` (or the empty choice with "") in the picker whose hidden field has the id `id`. */
export async function pickHero(page, id, heroId) {
  await page.click(`[data-hero-picker="${id}"] .hero-picker__button`);
  await page.click(`.pop.hero-pick [data-pick="${heroId}"]`);
}

/** The ids the panel of a picker offers, in order (the empty choice is ""); the panel is closed again. */
export async function heroesOffered(page, id) {
  await page.click(`[data-hero-picker="${id}"] .hero-picker__button`);
  const ids = await page
    .locator(".pop.hero-pick [data-pick]")
    .evaluateAll(items => items.map(item => item.dataset.pick));
  await page.keyboard.press("Escape");
  return ids;
}
