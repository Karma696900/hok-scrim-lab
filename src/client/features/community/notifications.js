import { t } from "../../app/browser-i18n.js";
import { escapeHtml } from "../../lib/dom.js";
import { dateTimeLabel, roleLabel } from "./labels.js";

/** The sentence of a notification, as markup (its values are escaped). */
export function notificationText(item) {
  const p = item.payload;
  const esc = escapeHtml;
  switch (item.kind) {
    case "request":
      return p.action === "counter"
        ? t("{team} proposes another time: {when}", {
            team: esc(p.team),
            when: esc(dateTimeLabel(p.startsAt))
          })
        : t("{team} asks you for a scrim: {when}", {
            team: esc(p.team),
            when: esc(dateTimeLabel(p.startsAt))
          });
    case "answer":
      return p.action === "accept"
        ? t("{team} accepted the scrim request", { team: esc(p.team) })
        : p.action === "decline"
          ? t("{team} declined the scrim request", { team: esc(p.team) })
          : t("{team} cancelled the scrim request", { team: esc(p.team) });
    case "message":
      return t("New message from {team}", { team: esc(p.team) });
    case "invitation":
      return t("{by} invites you to join {team} as {role}", {
        by: esc(p.by),
        team: esc(p.team),
        role: esc(roleLabel(p.role))
      });
    case "reminder":
      return t("{title} ({team}) starts at {when}", {
        title: esc(p.title),
        team: esc(p.team),
        when: esc(dateTimeLabel(p.startsAt))
      });
    default:
      return t("New notification");
  }
}

/** Where a notification leads. */
export const notificationLink = item =>
  item.kind === "invitation" ? "/teams" : item.kind === "reminder" ? "/agenda" : "/inbox";

/** The icon of a kind of notification. */
export const notificationIcon = kind =>
  ({ request: "swords", answer: "check", message: "mail", invitation: "users", reminder: "clock" })[
    kind
  ] ?? "bell";
