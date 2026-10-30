// discord, small helpers: prefLabel, notice, prefsList, linkCard, and 3 more.
import { escapeHtml as esc } from "../../lib/escape.js";
import { format } from "./labels.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, paintStage, stageHero, stageHtml } from "./stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { PREFS } from "./discord-shared.js";

export const prefLabel = key =>
  ({
    requests: t("Scrim requests and messages"),
    reminders: t("Agenda reminders (6 h, 4 h and 2 h before)"),
    results: t("Answers and team invitations")
  })[key];

export const notice = params => {
  if (params.get("linked")) {
    return `<div class="note rise">${icon("check", "i--sm")}<span>${t("Your Discord account is linked.")}</span></div>`;
  }
  if (params.get("error")) {
    const message =
      params.get("error") === "taken"
        ? t("This Discord account is already linked to another account.")
        : t("Discord could not be linked. Try again.");
    return `<div class="note note--warn rise" role="alert">${icon("warn", "i--sm")}<span>${message}</span></div>`;
  }
  return "";
};

export const prefsList = discord =>
  `<div class="dc-prefs" id="discord-prefs">${PREFS.map(
    key =>
      `<div class="dc-pref">${icon(PREF_ICONS[key])}<span class="row__body"><b>${esc(prefLabel(key))}</b></span><button type="button" class="switch${discord.prefs[key] ? " on" : ""}" role="switch" aria-checked="${Boolean(discord.prefs[key])}" aria-label="${esc(prefLabel(key))}" data-community="discord-pref" data-key="${key}"${discord.botConfigured ? "" : " disabled"}></button></div>`
  ).join("")}</div>`;

export const linkCard = discord => {
  if (!discord.configured) {
    return `<p class="muted">${t("Discord is not set up on this server: the site owner has to provide a Discord application. Your notifications stay on the site (Inbox).")}</p>`;
  }
  if (!discord.linked) {
    return `<p>${t("Link your Discord account to receive notifications as direct messages. We only ask for your Discord name and avatar: nothing is read from your servers or messages.")}</p><div class="discord-actions"><a class="btn btn--discord" href="/auth/discord">${icon("discord")}${t("Link my Discord")}</a></div>`;
  }
  return `<div class="dc-linked discord-linked">
        ${discord.avatarUrl ? `<span class="pt s-52"><img src="${esc(discord.avatarUrl)}" alt="" width="52" height="52" referrerpolicy="no-referrer"></span>` : `<span class="dlogo2">${icon("discord", "i--lg")}</span>`}
        <span class="row__body"><b>${esc(discord.username)} <span class="pill">${t("linked")}</span></b><small>${t("Linked {date}", { date: esc(format(discord.linkedAt, { dateStyle: "medium" })) })}</small></span>
        <button type="button" class="btn btn--danger btn--sm" data-community="unlink-discord">${t("Unlink")}</button>
      </div>
      <h3 class="subheading">${t("Notifications by direct message")}</h3>
      ${discord.botConfigured ? "" : `<p class="muted">${t("Direct messages are not enabled on this server (no bot): you still see everything in the Inbox.")}</p>`}
      ${prefsList(discord)}
      <div class="dc-test"><span class="row__body"><b>${t("Check that it works")}</b><small id="discord-test-result" role="status" aria-live="polite">${t("The bot sends you one message.")}</small></span><button type="button" class="btn btn--sm" data-community="discord-test"${discord.botConfigured ? "" : " disabled"}>${icon("mail", "i--sm")}${t("Send me a test message")}</button></div>`;
};

/** What the bot sends, as Discord draws it (examples, not data of the person). */
export const previews = () =>
  [
    [
      "requests",
      t("New scrim request"),
      t("Nova Gaming asks you for a BO3 scrim (Global Ban & Pick) on Fri, 20:00 UTC.")
    ],
    [
      "reminders",
      t("Scrim"),
      t("{title} ({team}) starts at {when}", {
        title: "Scrim vs Nova Gaming",
        team: "Alpha Esports",
        when: "Fri, 20:00"
      })
    ],
    [
      "results",
      t("Answers and team invitations"),
      t("{team} accepted the scrim request", { team: "Nova Gaming" })
    ]
  ]
    .map(
      ([key, title, text]) =>
        `<div class="bot-preview"><span class="dlogo2">${icon("discord")}</span><span><b>${esc(title)}</b><p>${esc(text)}</p><small>${esc(prefLabel(key))}</small></span></div>`
    )
    .join("");

export const serverRow = (team, server) => {
  const state = !server
    ? ["muted", t("Not connected")]
    : server.connected
      ? ["", `${server.guildName}${server.channelId ? ` · #${server.channelName}` : ""}`]
      : ["muted", t("Not connected")];
  return `<a class="dc-server row link-row" href="/teams/${encodeURIComponent(team.id)}?tab=discord">${teamEmblem(team, 40)}<span class="row__body"><b>${esc(team.name)}</b><small class="${state[0]}">${esc(state[1])}</small></span>${server?.connected ? `<span class="pill pill--live">${t("connected")}</span>` : ""}${icon("right", "i--sm")}</a>`;
};

export async function show(view) {
  const root = view.ctx.root();
  await view.ctx.loadMyTeams();
  const staff = view.ctx.staffTeams();
  const [discord, requests, agenda, servers] = await Promise.all([
    view.api("/api/me/discord"),
    view.api("/api/requests").then(data => data.items),
    view.api("/api/me/agenda").then(data => data.items),
    Promise.all(
      staff.map(team =>
        view.api(`/api/teams/${encodeURIComponent(team.id)}/discord`).catch(() => null)
      )
    )
  ]);
  const teams = view.ctx.myTeams();
  const steps = [
    [
      t("Link your Discord"),
      t("Receive requests, reminders and results as direct messages."),
      "discord",
      discord.linked,
      discord.configured ? "#discord-card" : null
    ],
    [
      t("Create or join a team"),
      t("A team has a roster, an agenda and its own Discord server."),
      "users",
      teams.length > 0,
      "/teams"
    ],
    [
      t("Set your availability"),
      t("Tell the other teams when you are free to play."),
      "clock",
      agenda.some(event => event.kind === "availability"),
      teams.length ? `/teams/${teams[0].id}?add=1` : "/teams"
    ],
    [
      t("Find your first scrim"),
      t("Ask a team for a scrim, or answer a request."),
      "swords",
      requests.length > 0,
      "/find"
    ]
  ];
  const done = steps.filter(step => step[3]).length;
  const on = discord.prefs ? PREFS.filter(key => discord.prefs[key]).length : 0;
  const hero = stageHero(10);
  root.innerHTML = `${stageHtml({
    cls: "dc-stage",
    hero,
    title: t("Discord & onboarding"),
    text: t("Link your Discord to get scrim requests, reminders and results as direct messages."),
    actions:
      discord.configured && !discord.linked
        ? `<a class="btn btn--discord btn--lg" href="/auth/discord">${icon("discord")}${t("Link my Discord")}</a>`
        : `<a class="btn btn--primary btn--lg" href="/inbox">${icon("mail")}${t("Inbox & notifications")}</a>`,
    figures: [
      [`${done}<small>/${steps.length}</small>`, t("Getting started")],
      [`${on}<small>/${PREFS.length}</small>`, t("Notifications")],
      [number(servers.filter(server => server?.connected).length), t("Team servers")]
    ]
  })}
      ${notice(new URLSearchParams(location.search))}
      <div class="cm-layout cm-layout--side dc-layout rise d-1">
        <div class="cm-main">
          <section class="card" aria-labelledby="dc-steps-title">
            <div class="card__head"><h2 id="dc-steps-title">${t("Getting started")}</h2><span class="count">${done} / ${steps.length}</span></div>
            <ol class="dc-steps steps-list">${steps
              .map(
                ([label, text, iconName, ok, link], index) =>
                  `<li class="row step-row dc-step${ok ? " done" : ""}"><span class="check${ok ? " on" : ""}" aria-hidden="true">${ok ? icon("check") : index + 1}</span><span class="dc-step__icon">${icon(iconName, "i--lg")}</span><span class="row__body"><b>${esc(label)}</b><small>${esc(text)}</small></span>${ok ? `<span class="pill">${t("done")}</span>` : link ? `<a class="btn btn--primary btn--sm" href="${link}">${t("Do it")}</a>` : ""}</li>`
              )
              .join("")}</ol>
            <div class="bar discord-progress" role="progressbar" aria-label="${t("Getting started")}" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i data-p="${Math.round((done / steps.length) * 100)}"></i></div>
          </section>
          <section class="card" id="discord-card">
            <div class="card__head"><h2>Discord</h2></div>
            ${linkCard(discord)}
          </section>
        </div>
        <aside class="cm-side dc-side">
          <section class="card"><div class="card__head"><h2>${t("What you receive")}</h2></div><div class="dc-previews">${previews()}</div><p class="muted">${t("You answer on the site, in your Inbox.")}</p></section>
          <section class="card"><div class="card__head"><h2>${t("Team servers")}</h2></div>${
            staff.length
              ? `<div class="list">${staff.map((team, index) => serverRow(team, servers[index])).join("")}</div>`
              : lineHtml(
                  "users",
                  t("Only the owner and the managers of a team can connect its server."),
                  "",
                  `<a class="btn btn--sm" href="/teams">${t("Teams")}</a>`,
                  "cm-line"
                )
          }</section>
        </aside>
      </div>`;
  paintStage(root, hero);
}

const PREF_ICONS = { requests: "swords", reminders: "clock", results: "check" };

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
