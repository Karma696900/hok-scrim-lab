// The title search engines show in their results: about 60 characters, the rest is cut. A title that is
// longer than that lets the name of the site go, so that the words people searched for stay visible.
import { SITE_NAME } from "./routes.js";

/** The characters a search result shows of a title. */
export const TITLE_ROOM = 60;

const SUFFIX = ` | ${SITE_NAME}`;

/** `title` as the browser tab and the search engines get it (the server and the browser use the same rule). */
export function fitTitle(title) {
  return title.length > TITLE_ROOM && title.endsWith(SUFFIX)
    ? title.slice(0, -SUFFIX.length)
    : title;
}
