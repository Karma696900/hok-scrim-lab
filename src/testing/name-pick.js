/* global document */
// Browser tests: choosing a stat, a tag… in the forms of the Catalog, where it is typed by name and picked
// from the names that match (src/client/features/catalog/catalog-search.js), as a person does.

/** Types the name of `value` (or `label`) in the name field whose hidden input is `name`, then Enter. */
export async function pickName(page, name, { value, label } = {}) {
  const holder = page.locator(`[data-name-pick]:has(input[name="${name}"])`);
  const text = label ?? (await holder.locator(`li[data-value="${value}"]`).first().textContent());
  const input = holder.locator("[data-name-pick-input]");
  await input.click();
  await input.fill(text);
  await input.press("Enter");
  const wanted =
    value ?? (await holder.locator("li", { hasText: text }).first().getAttribute("data-value"));
  await page.waitForFunction(
    ([field, id]) => document.querySelector(`input[name="${field}"]`)?.value === String(id),
    [name, wanted]
  );
}

/** The names a name field offers. */
export const pickNames = (page, name) =>
  page.locator(`[data-name-pick]:has(input[name="${name}"]) li`);
