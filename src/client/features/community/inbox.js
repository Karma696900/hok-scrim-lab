// The inbox. Wireframe:
//   1. a slim stage (cover, title, three numbers: waiting for you, open requests, unread);
//   2. three panes that fill the height of the screen: the filters on the left (All, Requests, Notifications,
//      Invitations, each with its count), the list in the middle (the requests as threads, the notifications, the
//      invitations with Accept and Decline), the conversation on the right (the team, the request with its
//      answers, the messages, the composer);
//   3. nothing open: one line that says so, and the three steps of a scrim.
// Accepting, declining or proposing another time never leaves the page. The server decides who may answer; the
// buttons only hide what would be refused.
import { icon } from "../../../shared/icons.js";
import { number, t } from "../../app/browser-i18n.js";
import { lineHtml, paintStage, scrimStepsHtml, stageHero, stageHtml } from "./stage.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as inboxParts } from "./inbox-parts.js";
import { onView as inboxLists } from "./inbox-lists.js";
import { onView as inboxThread } from "./inbox-thread.js";
import { onView as inboxActions } from "./inbox-actions.js";
import { actionsOf, formsOf } from "./inbox-actions.js";
import { wide } from "./inbox-parts.js";

export function createInboxPage(ctx) {
  const view = { ctx, show };
  bindTo(view, inboxParts, inboxLists, inboxThread, inboxActions);
  ({ api: view.api, tell: view.tell } = view.ctx);
  view.tab = "all";
  view.selected = null;
  view.requests = [];
  view.notifications = [];
  view.invitations = [];
  let timer = 0;
  view.teamFilter = ""; // the team the requests are limited to ("" = all the teams of the person)
  view.suggestions = []; // announcements of teams that look for a scrim: what the list offers when it is empty

  // ---- the page ---------------------------------------------------------------------------------
  async function show() {
    const root = view.ctx.root();
    await view.ctx.loadMyTeams();
    if (!view.ctx.myTeams().some(team => team.id === view.teamFilter)) {
      view.teamFilter = "";
    }
    [view.requests, view.notifications, view.invitations, view.suggestions] = await Promise.all([
      view.api("/api/requests").then(data => data.items),
      view.api("/api/notifications").then(data => data.items),
      view.api("/api/me/invitations").then(data => data.items),
      view
        .api("/api/scrim-posts?pageSize=8")
        .then(data =>
          data.items
            .filter(post => !view.ctx.myTeams().some(team => team.id === post.team.id))
            .slice(0, 6)
        )
        .catch(() => [])
    ]);
    const requested = new URLSearchParams(location.search).get("open");
    if (requested && view.requests.some(request => request.id === requested)) {
      view.selected = requested;
    } else if (!view.requests.some(request => request.id === view.selected)) {
      view.selected = null;
    }
    if (!view.selected && wide() && view.requests.length) {
      view.selected = (view.requests.find(request => request.awaitingMe) ?? view.requests[0]).id;
    }
    const hero = stageHero(7);
    root.innerHTML = `${stageHtml({
      cls: "ib-stage",
      hero,
      title: t("Inbox & notifications"),
      text: t("Scrim requests, answers and invitations, in one place."),
      actions: `<a class="btn btn--primary" href="/find">${icon("search")}${t("Find a scrim")}</a><a class="btn" href="/agenda">${icon("calendar")}${t("Agenda")}</a>`,
      figures: [
        [number(view.waiting()), t("Your turn")],
        [number(view.requests.length), t("Requests")],
        [number(view.unread()), t("Unread")]
      ]
    })}
      <div class="ib-app rise d-1${view.selected ? " has-open" : ""}" id="ib-app">
        <nav class="ib-rail card" aria-label="${t("Inbox & notifications")}">
          <div class="ib-rail__list" role="tablist" id="ib-rail-list"></div>
          <div class="ib-teams" id="ib-teams"></div>
          <p class="muted rules-note">${t("You can send {max} requests per day per team. Be respectful: you can report or block a team from any conversation.", { max: 5 })}</p>
        </nav>
        <section class="ib-listpane card card--flush" aria-label="${t("Requests")}">
          <div class="ib-listtop">
            <label class="field">${icon("search", "i--sm")}<input id="inbox-search" type="search" placeholder="${t("Search…")}" aria-label="${t("Search…")}" autocomplete="off"></label>
            <span id="ib-listtop-action"></span>
          </div>
          <div class="threads" id="thread-list"></div>
        </section>
        <section class="ib-detail card card--flush" id="thread-pane"><div class="ib-welcome">${lineHtml("mail", t("Select a request"), t("Requests you send or receive appear here."))}${scrimStepsHtml()}</div></section>
      </div>`;
    paintStage(root, hero);
    view.drawRail();
    view.drawList();
    if (view.selected) {
      view.showRequest(view.selected).catch(error => view.tell(error.message));
    }
    clearInterval(timer);
    timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        root.isConnected &&
        view.selected &&
        !root.querySelector("#message-form input")?.value
      ) {
        view.showRequest(view.selected).catch(() => {});
      }
    }, 20000);
  }

  view.actions = actionsOf(view);

  view.forms = formsOf(view);

  return {
    show,
    actions: view.actions,
    forms: view.forms,
    input: view.input,
    stop: () => clearInterval(timer)
  };
}
