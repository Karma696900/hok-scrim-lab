// The title of a hero page names what the page really holds: a build written by the editors, the
// counters seen in tournament games. Players search "<hero> build" and "<hero> counter".
import { message } from "./routes-shared.js";

/** The title key of a hero page (to translate with { name, site }). */
export function heroTitleKey({ build = false, games = false }) {
  if (build && games) {
    return message("{name} build, skills and counters — HOK Honor of Kings | {site}");
  }
  if (build) {
    return message("{name} build and skills — HOK Honor of Kings | {site}");
  }
  if (games) {
    return message("{name} skills and counters — HOK Honor of Kings | {site}");
  }
  return message("{name} — HOK Honor of Kings hero guide, skills and lanes | {site}");
}
