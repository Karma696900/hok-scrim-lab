// The security of the account (/account), in the site like any page: a stage with the three things to know
// (is the authenticator on, how many recovery codes are left, when did the last sign-in happen), then what
// protects the account on one side (authenticator, password, recovery codes) and what happened on the other
// (this session, every session, the log). Every block says its state, on or off.
import { escapeHtml } from "../../lib/escape.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as authSecurityParts } from "./auth-security-parts.js";
import { paintArt } from "./auth-security-parts.js";

export function createSecurityView({ session, state }) {
  const page = { session, state };
  bindTo(page, authSecurityParts);
  page.esc = escapeHtml;

  return { view: page.view, paintArt };
}
