// Discord and Settings tabs (the staff only).
import { escapeHtml as esc } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { teamFormHtml } from "./form.js";

// ---- Discord ----------------------------------------------------------------------------------
/** The team's Discord server: add the bot, choose the channel, test, disconnect (owner and managers). */
export function discordPanel(team) {
  const discord = team.discord;
  const addBot = `<a class="btn btn--discord discord-button" href="/auth/discord/bot?team=${encodeURIComponent(team.id)}">${icon("discord")}${t("Add the bot to my server")}</a>`;
  if (!discord?.configured || !discord.connected) {
    return `<section class="card tp-discord" id="team-discord"><div class="card__head"><h2>Discord</h2></div>${
      discord?.configured
        ? `<p>${t("Add the bot to your Discord server: it posts the reminders (6 h, 4 h and 2 h before), the confirmed scrims and a weekly digest in the channel you choose.")}</p><div class="team-discord__add">${addBot}</div>`
        : `<p class="muted">${t("The Discord bot is not set up on this server: the site owner has to provide a Discord application.")}</p>`
    }</section>`;
  }
  return `<div class="cm-layout cm-layout--side tp-discordlayout" id="team-discord">
      <section class="card">
        <div class="card__head"><h2>Discord</h2><span class="pill pill--live">${t("connected")}</span></div>
        <div class="serverbox2"><span class="dlogo2">${icon("discord", "i--lg")}</span><div><b>${esc(discord.guildName)}</b>${discord.channelId ? `<small>#${esc(discord.channelName)}</small>` : ""}</div></div>
        <p class="muted tp-discord__what">${t("Add the bot to your Discord server: it posts the reminders (6 h, 4 h and 2 h before), the confirmed scrims and a weekly digest in the channel you choose.")}</p>
        ${discord.problem ? `<p class="form-error" role="alert">${t("The bot cannot see this server any more: add it again.")}</p><div class="team-discord__add">${addBot}</div>` : ""}
      </section>
      <section class="card">
        <form id="discord-channel-form" novalidate>
          <label class="label">${t("Channel for notifications")}<span class="field"><select id="discord-channel" name="channelId"><option value="">—</option>${discord.channels.map(channel => `<option value="${esc(channel.id)}"${channel.id === discord.channelId ? " selected" : ""}>#${esc(channel.name)}</option>`).join("")}</select></span></label>
          <div class="hstack wrap team-discord__add"><button class="btn btn--primary" type="submit">${discord.channelId ? t("Change the channel") : t("Use this channel")}</button><button class="btn btn--danger" type="button" data-team="discord-disconnect">${t("Disconnect")}</button></div>
        </form>
      </section>
    </div>`;
}

// ---- Settings ---------------------------------------------------------------------------------
export function settingsPanel(team) {
  return `${teamFormHtml(team)}${
    team.myRole === "owner"
      ? `<section class="card tp-danger"><div class="card__head"><h2>${t("Danger zone")}</h2></div><p class="muted">${t("Delete this team and its roster? This cannot be undone.")}</p><div class="hstack wrap"><button type="button" class="btn btn--danger" data-team="delete-team">${icon("trash")}${t("Delete the team")}</button></div></section>`
      : ""
  }`;
}
