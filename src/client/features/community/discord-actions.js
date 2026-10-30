// discord, what happens on a click, a key or a submit: actionsOf.
import { t } from "../../app/browser-i18n.js";
import { PREFS } from "./discord-shared.js";

export const actionsOf = view => ({
  "unlink-discord": async () => {
    if (!confirm(t("Unlink your Discord account?"))) {
      return;
    }
    await view.api("/api/me/discord", { method: "DELETE" });
    await view.show();
  },
  "discord-test": async button => {
    const result = view.ctx.root().querySelector("#discord-test-result");
    button.disabled = true;
    result.classList.remove("is-bad");
    try {
      const answer = await view.api("/api/me/discord/test", { method: "POST" });
      result.textContent = (
        answer.sent ? TEST_RESULTS.sent : (TEST_RESULTS[answer.reason] ?? TEST_RESULTS.unknown)
      )();
      result.classList.toggle("is-bad", !answer.sent);
    } catch (error) {
      result.textContent = error.message;
      result.classList.add("is-bad");
    } finally {
      button.disabled = false;
    }
  },
  "discord-pref": async button => {
    const on = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(on));
    button.classList.toggle("on", on);
    const body = Object.fromEntries(
      PREFS.map(key => [
        key,
        view.ctx.root().querySelector(`[data-key="${key}"]`).getAttribute("aria-checked") === "true"
      ])
    );
    try {
      await view.api("/api/me/discord/prefs", { method: "PUT", body });
      view.tell(t("Saved"));
    } catch (error) {
      button.setAttribute("aria-checked", String(!on));
      button.classList.toggle("on", !on);
      view.tell(error.message);
    }
  }
});

/** What the person is told after "Send me a test message": it went, or why it did not (the reasons of whyNotSent). */
const TEST_RESULTS = {
  sent: () => t("Test message sent: look in your Discord direct messages."),
  "shared-server": () =>
    t(
      "Discord does not let the bot write to you. A bot can only write to people who share a server with it (add it to your team's server from the Discord card of the team) and who allow direct messages from server members."
    ),
  "bot-token": () => t("Discord refused the token of the bot: the site owner has to check it."),
  busy: () => t("Discord asks to slow down. Try again in a minute."),
  unreachable: () => t("Discord could not be reached. Try again in a minute."),
  "no-bot": () =>
    t(
      "Direct messages are not enabled on this server (no bot): you still see everything in the Inbox."
    ),
  unknown: () => t("Discord refused the message. Try again later.")
};
