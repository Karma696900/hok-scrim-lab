// admin routes, small helpers: requireHero.
import { requireHero } from "./require-hero.js";

export { requireHero };

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { requireHero };
