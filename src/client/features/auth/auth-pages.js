// Account pages: sign in, create account, authenticator code, enrolment (QR + recovery codes), the pseudo of a
// person who came with Google, account security. Real <form>s with the right autocomplete hints (password
// managers and OS one-time-code autofill work). The views are in entry.js and security.js; this file holds the
// state of the flow, loads what a page needs and answers its forms and buttons.
import { createEntryViews } from "./entry.js";
import { createSecurityView } from "./auth-security.js";
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as authPagesParts } from "./auth-pages-parts.js";
import { onView as authPagesActions } from "./auth-pages-actions.js";
import { nextPath, nextQuery } from "./auth-pages-parts.js";

export function createAuthPages({ api, tell, state, go }) {
  const page = { state, api, go, tell };
  bindTo(page, authPagesParts, authPagesActions);
  // what the flow carries from one page to the next
  page.session = {
    setup: null, // { qr, secret, uri, account } of the authenticator being set up
    recovery: null, // recovery codes just generated (shown once)
    overview: null, // /api/auth/security
    useRecovery: false,
    config: { registration: true, google: false }
  };

  const entry = createEntryViews({ escapeHtml, session: page.session, nextQuery, nextPath });
  page.security = createSecurityView({ escapeHtml, session: page.session, state: page.state });
  page.pages = { ...entry, account: page.security.view };

  return {
    render: page.render,

    reset: page.reset,

    onSubmit: page.onSubmit,

    onClick: page.onClick
  };
}
