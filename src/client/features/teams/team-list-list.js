// team list, list: filters, paintFigures, loadGrid, enrichMine, and 3 more.
import { dateTimeLabel, format, kindLabel } from "../community/labels.js";
import { escapeHtml as esc } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";
import { lineHtml, paintStage, setFigure, stageHero, stageHtml } from "../community/stage.js";
import { number, t } from "../../app/browser-i18n.js";
import { skeleton } from "../../lib/skeleton.js";
import { invitationRow, mineCard, postsBand, stepsBand, teamCard } from "./team-list-pieces.js";

// ---- the list ---------------------------------------------------------------------------------
export const filters = view => {
  const data = new FormData(view.ctx.root().querySelector("#team-filters"));
  return {
    q: String(data.get("q") ?? "").trim(),
    level: String(data.get("level") ?? ""),
    region: String(data.get("region") ?? "")
  };
};

/** The numbers of the stage: the whole community, whatever the filters say. */
export function paintFigures(view, list, count) {
  const root = view.ctx.root();
  const exact = list.length >= count;
  const members = list.reduce((sum, team) => sum + (team.memberCount ?? 0), 0);
  setFigure(root, "fig-teams", number(count));
  setFigure(root, "fig-members", exact ? number(members) : `${number(members)}+`);
  setFigure(root, "count-all", count);
}

export async function loadGrid(view, { more = false } = {}) {
  const root = view.ctx.root();
  const grid = root.querySelector("#team-grid");
  const { q, level, region } = view.filters();
  const active = Boolean(q || level || region);
  let loaded;
  if (view.scope === "mine") {
    const needle = q.toLocaleLowerCase();
    loaded = view.mine.filter(
      team =>
        (!needle || `${team.name} ${team.tag}`.toLocaleLowerCase().includes(needle)) &&
        (!level || team.level === level) &&
        (!region || team.region === region)
    );
    view.items = loaded;
    view.total = loaded.length;
  } else {
    view.page = more ? view.page + 1 : 1;
    const query = new URLSearchParams(
      Object.entries({ q, level, region }).filter(([, value]) => value)
    );
    query.set("pageSize", String(PAGE_SIZE));
    query.set("page", String(view.page));
    const result = await view.api(`/api/teams?${query}`);
    view.items = more ? [...view.items, ...result.items] : result.items;
    view.total = result.total;
    if (!active) {
      view.paintFigures(view.items, view.total);
    }
  }
  if (!grid.isConnected) {
    return;
  }
  const roles = new Map(view.mine.map(team => [team.id, team.myRole]));
  grid.innerHTML = view.items.length
    ? view.items.map((team, index) => teamCard(team, index, roles.get(team.id))).join("") +
      (view.scope === "all" && !active
        ? `<button type="button" class="tm-add rise" data-team="open-form">${icon("plus", "i--lg")}<b>${t("Create a team")}</b><span>${t("Register your team and run its roster.")}</span></button>`
        : "")
    : view.emptyList(active);
  root.querySelector("#team-count").innerHTML = view.items.length
    ? t("{shown} of {total} shown", { shown: `<b>${view.items.length}</b>`, total: view.total })
    : "";
  root.querySelector('[data-team="more-teams"]').hidden = view.items.length >= view.total;
  for (const button of root.querySelectorAll('[data-team="reset-team-filters"]')) {
    button.hidden = !active;
  }
}

/** The next event and the series of each team of the person (two small lines on the card). */
export async function enrichMine(view) {
  if (!view.mine.length) {
    return;
  }
  const now = Date.now();
  const [agenda, ...shared] = await Promise.all([
    view.api(`/api/me/agenda?from=${now}&to=${now + 60 * 86400000}`).catch(() => ({ items: [] })),
    ...view.mine.map(team =>
      view
        .api(`/api/teams/${encodeURIComponent(team.id)}/series?view=summary&pageSize=50`)
        .catch(() => null)
    )
  ]);
  const root = view.ctx.root();
  for (const [index, team] of view.mine.entries()) {
    const card = root.querySelector(`[data-mine="${CSS.escape(team.id)}"]`);
    if (!card) {
      continue;
    }
    const next = agenda.items.find(
      event => event.team.id === team.id && !["availability", "unavailable"].includes(event.kind)
    );
    card.querySelector(".tm-mine__next").innerHTML = next
      ? `<span class="cm-date k-${esc(next.kind)}">${new Date(next.startsAt).getDate()}<small>${esc(format(next.startsAt, { weekday: "short" }))}</small></span><span><b>${esc(next.title || kindLabel(next.kind))}</b><small>${esc(dateTimeLabel(next.startsAt))}</small></span>`
      : `${icon("calendar", "i--sm")}<span class="muted">${t("Nothing planned in the next 60 days.")}</span>`;
    const series = shared[index];
    const record = series ? recordOf(team, series.items) : { won: 0, lost: 0 };
    card.querySelector(".tm-mine__series").innerHTML = series?.total
      ? `${icon("swords", "i--sm")}<span><b>${t("{count, plural, one {# series} other {# series}}", { count: series.total })}</b>${record.won + record.lost ? `<small>${t("{won} won · {lost} lost", record)}</small>` : ""}</span>`
      : `${icon("swords", "i--sm")}<span class="muted">${t("No series shared with the team yet.")}</span>`;
  }
}

export async function show(view) {
  const root = view.ctx.root();
  view.scope = "all";
  view.items = [];
  view.total = 0;
  view.page = 1;
  [view.invitations, view.mine] = view.signedIn()
    ? await Promise.all([
        view.api("/api/me/invitations").then(data => data.items),
        view.api("/api/me/teams").then(data => data.items)
      ])
    : [[], []];
  const hero = stageHero(4);
  root.innerHTML = `${stageHtml({
    cls: "tm-stage",
    hero,
    title: t("Teams"),
    text: t("Register your team and run its roster."),
    actions: `<button type="button" class="btn btn--primary btn--lg" data-team="open-form">${icon("plus")}${t("Create a team")}</button><a class="btn btn--lg" href="/find">${icon("search")}${t("Find a scrim")}</a>`,
    figures: [
      ["–", t("Teams"), "fig-teams"],
      ["–", t("Members"), "fig-members"],
      ["–", t("Open announcements"), "fig-posts"]
    ]
  })}
      <div id="team-form-slot" hidden></div>
      ${
        view.invitations.length
          ? `<section class="card card--blue keep-dark tm-invites rise d-1"><div class="card__head"><h2>${icon("mail")}${t("Invitations for you")}</h2><span class="count">${view.invitations.length}</span></div><div class="list">${view.invitations.map(invitationRow).join("")}</div></section>`
          : ""
      }
      ${
        view.mine.length
          ? `<section class="tm-mine-band rise d-1" aria-labelledby="tm-mine-title"><h2 id="tm-mine-title">${t("Your teams")}</h2><div class="tm-mine-grid">${view.mine.map(mineCard).join("")}</div></section>`
          : view.signedIn()
            ? lineHtml(
                "users",
                t("You are not in a team yet."),
                t("Create one, or wait for an invitation from a captain."),
                `<button type="button" class="btn btn--primary btn--sm" data-team="open-form">${icon("plus", "i--sm")}${t("Create a team")}</button>`,
                "cm-line tm-none"
              )
            : ""
      }
      <div class="cm-layout tm-layout rise d-2">
        ${view.filtersHtml()}
        <section class="cm-main" aria-label="${t("Teams")}">
          <div class="cm-bar"><p id="team-count" role="status"></p><button type="button" class="btn btn--ghost btn--sm" data-team="reset-team-filters" hidden>${icon("refresh", "i--sm")}${t("Reset filters")}</button></div>
          <div class="tm-grid" id="team-grid">${skeleton("grid", 6)}</div>
          <div class="tm-more"><button type="button" class="btn" data-team="more-teams" hidden>${icon("chevron", "i--sm")}${t("Show more teams")}</button></div>
        </section>
      </div>
      ${stepsBand()}
      <div id="team-posts"></div>`;
  paintStage(root, hero);
  const posts = view.api("/api/scrim-posts?pageSize=3").catch(() => ({ items: [], total: 0 }));
  posts.then(result => {
    setFigure(root, "fig-posts", number(result.total));
    const slot = root.querySelector("#team-posts");
    if (slot) {
      slot.innerHTML = postsBand(result.items);
    }
  });
  view.enrichMine();
  await view.loadGrid();
}

export async function answer(view, button, choice) {
  await view.api(`/api/invitations/${encodeURIComponent(button.dataset.id)}/${choice}`, {
    method: "POST"
  });
  view.tell(choice === "accept" ? t("Welcome to the team") : t("Invitation declined"));
  window.dispatchEvent(new Event("hok:community"));
  await view.show();
}

const PAGE_SIZE = 50;

const norm = value =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

/** The score of the series a team shared with its members: won and lost (only the ones whose side carries its name). */
export function recordOf(team, list) {
  let won = 0;
  let lost = 0;
  for (const series of list) {
    if (series.status !== "complete") {
      continue;
    }
    const side =
      norm(series.teamA) === norm(team.name)
        ? ["teamA", "teamB"]
        : norm(series.teamB) === norm(team.name)
          ? ["teamB", "teamA"]
          : null;
    if (side && series.score[side[0]] > series.score[side[1]]) {
      won += 1;
    } else if (side && series.score[side[0]] < series.score[side[1]]) {
      lost += 1;
    }
  }
  return { won, lost };
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { filters, paintFigures, loadGrid, enrichMine, show, answer };
