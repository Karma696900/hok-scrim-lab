// The navigation of the top bar keeps its entries in groups that open on a click: a test that wants
// an entry opens its group first when the entry is not on screen.

/**
 * Opens a tab of a hero sheet (overview, skills, combos, builds, competitive, patches, artwork): only
 * the open tab is on the screen, the others are hidden.
 */
export async function openHeroTab(page, tab) {
  await page.click(`.hero-tabs [data-tab="${tab}"]`);
  await page.waitForSelector(`.hs-panel[data-panel="${tab}"]:not([hidden])`);
}

/** Clicks the navigation entry matching `selector`, opening its group when needed. */
export async function goNav(page, selector) {
  const link = page.locator(selector).first();
  if (!(await link.isVisible())) {
    const group = page.locator("#main-nav .nav-group", { has: link });
    await group.locator(".nav-group__btn").click();
  }
  await link.click();
  // the panel of a group stays open while the pointer is over it: move away so it does not cover the page
  await page.mouse.move(2, 640);
}
