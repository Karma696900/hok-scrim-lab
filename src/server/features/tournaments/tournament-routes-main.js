// tournament routes, main: registerMainRoutes.
import { adminOnly } from "../../platform/http/async.js";

export function registerMainRoutes(ctx) {
  ctx.router.use("/admin", adminOnly);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerMainRoutes };
