// Welcome pages: what the site is (and the language), which optional parts the person wants in their menu
// (the community is always on), what the community is, and where to start. Shown once after signing in, and
// again from Settings. A panel with the cover of a hero and the four steps on one side, the step on the
// other. Loaded on demand.
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as onboardingParts } from "./onboarding-show.js";

export function createOnboarding({ hydration, api, tell, go, state, applyModules }) {
  const flow = { hydration, state, applyModules, api, tell, go };
  bindTo(flow, onboardingParts);
  flow.esc = escapeHtml;

  return {
    show: flow.show
  };
}
