// The way in: sign in, create an account, the code of the authenticator, the authenticator to set up (QR,
// then the recovery codes), the pseudo of a person who came with Google. Every page is two columns over the
// whole screen: the cover of the hero of the day under a veil, a few words and three reasons on one side; on
// the other one column of labelled fields, the steps of the flow above the title when it has several.
import { bindTo } from "../../../shared/bind-to.js";
import { onView as entryParts } from "./entry-parts.js";
import { profile } from "./entry-parts.js";

/**
 * `session` is the page's own state ({ config, setup, recovery, useRecovery }); `nextQuery` and `nextPath`
 * say where the person goes after signing in.
 */
export function createEntryViews({ session, nextQuery, nextPath }) {
  const view = { session, nextPath, nextQuery };
  bindTo(view, entryParts);

  return {
    login: view.login,

    register: view.register,

    profile,

    mfa: view.mfa,

    setup: view.setup
  };
}
