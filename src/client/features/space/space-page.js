// The personal space, and the page that a link to it opens. A person keeps their tier lists, their
// builds and their training sheet on their account; the space page shows them what a link would show,
// lets them give links (one per audience, each for the parts they choose, each removable) and keep
// builds from the lab. A link opens the same columns, read only, without an account: its token is in
// the address after "#", which no server ever receives.
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as spacePageParts } from "./space-link-page.js";
import { onView as spacePageColumnsSame } from "./space-columns.js";
import { onView as spacePagePageOwner } from "./space-owner.js";

export function createSpacePages({ hydration, api, tell, state }) {
  const view = { state, api, hydration, tell };
  bindTo(view, spacePageParts, spacePageColumnsSame, spacePagePageOwner);
  view.esc = escapeHtml;
  view.catalog = null;

  return { show: view.show, showShared: view.showShared };
}
