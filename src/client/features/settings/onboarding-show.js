// onboarding, small helpers: show.
import { MODULES } from "./parts.js";
import { sceneHero } from "../../domain/scene-art.js";
import { pageRoot } from "../../app/view-wrapper.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as onboardingPartsParts } from "./onboarding-steps.js";
import { onView as onboardingPartsActions } from "./onboarding-actions.js";
export { steps } from "./onboarding-shared.js";
export { community } from "./onboarding-steps.js";

export async function show(flow, app) {
  const ui = { flow };
  bindTo(ui, onboardingPartsParts, onboardingPartsActions);
  ui.root = pageRoot(app, ui.flow.hydration);
  ui.step = ui.flow.state.onboarded && (ui.flow.state.auth.user || ui.flow.state.modules) ? 1 : 0; // someone who already chose comes back to the choice; a new visitor starts at the welcome
  ui.chosen = new Set(ui.flow.state.modules ?? MODULES);
  ui.hero = sceneHero(3);

  ui.root.onclick = ui.onClick;

  ui.root.onchange = ui.onChange;
  ui.paint();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
