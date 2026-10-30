import { applyTones } from "./hero-sheet-parts.js";
import { render } from "../../app/router.js";
import { skillsSection } from "./hero-panels.js";
import { state } from "../../app/app-state.js";
import { watchVideos } from "../../lib/dom.js";

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The skills block drawn again (the open skill changed); the rest of the sheet stays. */
export function repaintSkills() {
  const body = document.querySelector("#skills-body");
  const details = state.heroSheet?.details;
  if (!body || !details) {
    render();
    return false;
  }
  body.innerHTML = skillsSection(details);
  applyTones(body);
  watchVideos(body);
  return true;
}
