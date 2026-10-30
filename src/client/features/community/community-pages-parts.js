// community pages, small helpers: signedIn, loadMyTeams, contextOf, findOf, and 7 more.
import { STAFF } from "./community-shared.js";
import {
  agendaStepsHtml,
  lineHtml,
  paintStage,
  scrimStepsHtml,
  stageHero,
  stageHtml
} from "./stage.js";
import { createAgendaPage } from "./agenda.js";
import { createDiscordPage } from "./discord.js";
import { createFindPage } from "./find.js";
import { createInboxPage } from "./inbox.js";
import { createPlayerPage } from "./player.js";
import { createReportsPage } from "./reports.js";
import { escapeHtml } from "../../lib/escape.js";
import { t } from "../../app/browser-i18n.js";

export const signedIn = pane => Boolean(pane.state.auth.user);

export const loadMyTeams = async pane => {
  pane.myTeams = pane.signedIn() ? (await pane.api("/api/me/teams")).items : [];
  return pane.myTeams;
};

/** What a page of the community asks of the one that draws it. */
export const contextOf = pane => ({
  api: pane.api,
  esc: escapeHtml,
  tell: pane.tell,
  go: pane.go,
  state: pane.state,
  hydration: pane.hydration,
  root: () => pane.root,
  myTeams: () => pane.myTeams,
  staffTeams: () => pane.myTeams.filter(team => STAFF.includes(team.myRole)),
  loadMyTeams: pane.loadMyTeams,
  signedIn: pane.signedIn
});

export const findOf = pane => createFindPage(pane.context);

export const inboxOf = pane => createInboxPage(pane.context);

export const agendaOf = pane => createAgendaPage(pane.context);

export const playerOf = pane => createPlayerPage(pane.context);

export const reportsOf = pane => createReportsPage(pane.context);

export const discordOf = pane => createDiscordPage(pane.context);

export const pagesOf = pane => [
  pane.find,
  pane.inbox,
  pane.agenda,
  pane.player,
  pane.reports,
  pane.discord
];

/** What a visitor sees on a page that needs an account: the stage, one line to sign in, and what the page gives. */
export const needSignIn = (pane, view) => {
  const [title, text, steps, offset] = {
    inbox: [
      t("Inbox & notifications"),
      t("Scrim requests, answers and invitations, in one place."),
      scrimStepsHtml(),
      7
    ],
    agenda: [t("Agenda"), t("Join or create a team to get an agenda."), agendaStepsHtml(), 9],
    discord: [
      t("Discord & onboarding"),
      t("Link your Discord to get scrim requests, reminders and results as direct messages."),
      scrimStepsHtml(),
      10
    ]
  }[view];
  const hero = stageHero(offset);
  pane.root.innerHTML = `${stageHtml({ cls: "cm-stage--slim", hero, title, text })}${lineHtml(
    "lock",
    escapeHtml(title),
    t("Sign in to use the community features."),
    `<a class="btn btn--primary btn--sm" href="/login?next=${encodeURIComponent(location.pathname)}">${t("Sign in")}</a>`,
    "empty sign-in-prompt"
  )}<section class="fd-how" aria-hidden="false">${steps}</section>`;
  paintStage(pane.root, hero);
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { signedIn, loadMyTeams, needSignIn };
