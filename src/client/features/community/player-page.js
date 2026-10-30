// player, page: notFound, show.
import { avatarMarkup } from "../auth/auth-avatar.js";
import { escapeHtml as esc } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { labelName } from "./community-shared.js";
import { lineHtml, paintStage, stageHero, stageHtml } from "./stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { aboutBlock, inviteCard, matesBlock, teamsBlock } from "./player-pieces-page.js";

// ---- the page ---------------------------------------------------------------------------------
export const notFound = message =>
  lineHtml(
    "user",
    t("Player not found"),
    esc(message),
    `<a class="btn btn--sm" href="/teams">${t("Teams")}</a>`
  );

export async function show(view, tag) {
  const root = view.ctx.root();
  let player;
  try {
    player = await view.api(`/api/players/${encodeURIComponent(tag)}`);
  } catch (error) {
    root.innerHTML = notFound(error.message);
    return;
  }
  await view.ctx.loadMyTeams();
  const staff = view.ctx.staffTeams();
  const p = player.profile;
  const [assigned, rosters] = await Promise.all([
    player.isMe ? view.api("/api/training/assigned").catch(() => ({ teams: [] })) : { teams: [] },
    Promise.all(
      player.teams
        .slice(0, 2)
        .map(team => view.api(`/api/teams/${encodeURIComponent(team.id)}`).catch(() => null))
    )
  ]);
  const mates = [
    ...new Map(
      rosters
        .flatMap(team => team?.members ?? [])
        .filter(member => member.tag !== player.tag)
        .map(member => [member.userId, member])
    ).values()
  ].slice(0, 8);
  const chips = [
    ...player.teams
      .slice(0, 3)
      .map(
        team =>
          `<a class="tagchip" href="/teams/${encodeURIComponent(team.id)}">${esc(team.tag)}</a>`
      ),
    player.admin
      ? `<span class="tagchip tagchip--hi">${icon("star", "i--sm")}${t("Admin")}</span>`
      : "",
    ...player.labels.map(
      label =>
        `<span class="tagchip tagchip--hi">${label === "verified" ? icon("check", "i--sm") : ""}${esc(labelName(label))}</span>`
    ),
    player.discordLinked
      ? `<span class="tagchip">${icon("discord", "i--sm")}${t("Discord linked")}</span>`
      : ""
  ].join("");
  const art = view.hero(p.mainHeroes[0]) ?? stageHero(8);
  const staging = stageHtml({
    cls: "profile-head pl-stage",
    hero: art,
    badge: `<span class="pl-avatar">${avatarMarkup(player, 132)}</span>`,
    title: esc(player.name),
    text: `<span class="pl-tag">#${esc(player.tag)}</span>${chips ? `<span class="pl-chips">${chips}</span>` : ""}`,
    actions: player.isMe
      ? `<button type="button" class="btn btn--primary btn--lg" data-community="edit-profile">${icon("pencil")}${t("Edit my profile")}</button>`
      : !player.isMe && staff.length
        ? `<a class="btn btn--primary btn--lg" href="#pl-invite">${icon("send")}${t("Invite to team")}</a>`
        : "",
    figures: [
      [number(player.teams.length), t("Teams")],
      [number(p.mainHeroes.length), t("Main heroes")],
      [number(p.languages.length), t("Languages")]
    ]
  });
  const infos = new Map(rosters.filter(Boolean).map(team => [team.id, team]));
  const tools = [inviteCard(player, staff), view.labelsCard(player)].join("");
  root.innerHTML = `${staging}
      <div id="profile-form-slot" hidden></div>
      <div class="cm-layout cm-layout--side pl-layout rise d-1">
        <div class="cm-main">
          ${view.heroesBlock(player)}
          ${teamsBlock(player, infos)}
          ${view.personalBlocks(assigned, player.isMe)}
        </div>
        <aside class="cm-side">
          ${aboutBlock(player)}
          ${matesBlock(mates)}
          ${tools}
        </aside>
      </div>`;
  paintStage(root, art);
  view.current = player;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { show };
