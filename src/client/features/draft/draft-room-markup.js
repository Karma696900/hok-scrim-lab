// The room: a side with its bans and picks, the pool, the action bar, the result and the log.
import { LANE_ICON_URLS, laneLabel } from "../../domain/lanes.js";
import { PICK_LANES, banSlots, expectedLane, stepsOf } from "../../../shared/draft-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";

/**
 * One side of the room: its team, its five bans in a row, then its five picks as tall cards. The Red side is
 * the Blue one turned around (the row of bans starts at its outer edge, the card carries its number there).
 */
export function sideMarkup(side) {
  const label = side === "blue" ? t("Blue side") : t("Red side");
  const banSlotsHtml = Array.from(
    { length: 5 },
    (_, index) =>
      `<span class="hero-slot ban empty" data-slot="ban-${index}" data-hero=""><span class="ban-number">${index + 1}</span>${icon("ban")}<span class="slot-art"></span></span>`
  ).join("");
  const pickSlotsHtml = PICK_LANES.map(
    (lane, index) =>
      `<span class="hero-slot pick empty" data-slot="pick-${index}" data-rank-role="${escapeHtml(lane)}" data-hero=""><span class="slot-art"></span><span class="slot-rank">${index + 1}</span><span class="pick-role"><span class="slot-lanes"></span><span class="pick-lane-label"></span></span><span class="slot-words"><b class="slot-name"></b><small class="slot-sub"></small></span></span>`
  ).join("");
  return `<section class="team-draft dr-side ${side}" data-side="${side}" aria-label="${label}">
      <header class="dr-side__head"><span data-ref="${side}-emblem"></span><div><h2 data-ref="${side}-name"></h2><small class="team-side-label ${side}">${label}</small></div></header>
      <div class="team-top ${side}"><div class="team-slot-group ban-group" data-ref="${side}-ban-group"><div class="team-slot-label"><h3>${t("Bans")}</h3><span data-ref="${side}-ban-count">0 / 5</span></div><div class="ban-slot-row" data-ref="${side}-bans">${banSlotsHtml}</div></div></div>
      <div class="team-picks ${side}"><div class="team-slot-group" data-ref="${side}-pick-group"><div class="team-slot-label visually-hidden"><span>${t("Picks")}</span><span data-ref="${side}-pick-count">0 / 5</span></div><div class="pick-slot-row" data-ref="${side}-picks">${pickSlotsHtml}</div></div></div>
    </section>`;
}

/**
 * The room, empty: the two sides, the clock and the pool (hidden), as the board draws them before and after a game's
 * state arrives. `frame()` gives it to the page before its series is known (see scrims/board.js).
 */
export function roomMarkup({ readOnly = false, picksOnly = false } = {}) {
  return `<section class="draft-area dr-area keep-dark${readOnly ? " draft-readonly" : ""}${picksOnly ? " picks-only" : ""}" data-ref="area">
      <p class="visually-hidden" role="status" aria-live="polite" data-ref="live"></p>
      <div class="draft-layout dr-room">
        <span class="dr-glow-side blue" aria-hidden="true"></span><span class="dr-glow-side red" aria-hidden="true"></span>
        ${sideMarkup("blue")}
        <div class="dr-center">
          <div class="clock dr-clock card card--feature" data-ref="clock">
            <div class="dr-clock__text">
              <span class="phase-label" data-ref="phase"></span>
              <span class="turn-team" data-ref="turn"></span>
              <div class="phase-action" data-ref="action"></div>
            </div>
            <div class="timer-ring dr-clock__dial" data-ref="ring">
              <strong class="timer timer--idle" id="draft-timer" data-ref="timer">--:--</strong>
              <span class="dr-clock__bar" aria-hidden="true"><i data-ref="bar"></i></span>
            </div>
          </div>
          <section class="card draft-pool dr-pool" data-ref="pool" hidden>
            <h2 class="visually-hidden" data-ref="pool-title"></h2>
            <div class="lane-tabs pool-lanes" role="group" aria-label="${t("Filter by lane")}" data-ref="lane-bar">${PICK_LANES.map(lane => `<button type="button" class="lane-tab" data-lane="${escapeHtml(lane)}" aria-pressed="false"><img src="${LANE_ICON_URLS[lane]}" alt="" width="30" height="30"><span>${escapeHtml(laneLabel(lane))}</span><small data-lane-count="${escapeHtml(lane)}">0</small></button>`).join("")}</div>
            <div class="pool-filters">
              <label class="field">${icon("search")}<input id="draft-search" type="search" placeholder="${t("Search hero pool")}" aria-label="${t("Search hero pool")}" autocomplete="off"></label>
              <label class="field"><select id="draft-class" aria-label="${t("Filter by type of hero")}"><option value="All">${t("All types")}</option></select></label>
              <p class="pool-hint">${icon("eye", "i--sm")}<span data-ref="pool-count"></span></p>
            </div>
            <div class="hero-grid" data-ref="grid"></div>
          </section>
          <section class="dr-result" data-ref="result"></section>
          <section class="card dr-log" data-ref="log" hidden></section>
        </div>
        ${sideMarkup("red")}
      </div>
    </section>`;
}

export function mount(view, container, ctx) {
  const { series, game, readOnly } = ctx;
  const key = `${series.id}:${game.id}:${readOnly ? "ro" : "live"}`;
  if (view.root === container && view.mountedKey === key) {
    return false;
  }
  view.root = container;
  view.mountedKey = key;
  view.lastActions = game.draft.actions.length;
  view.lastTimerName = null;
  view.lastSuggested = null;
  view.resultBuilt = false;
  view.cards.clear();
  view.filter.search = "";
  view.filter.lane = "All";
  view.filter.role = "All";
  container.dataset.html = "";
  // a board the server drew (or the page painted as a frame) is adopted: the clock stays the same node
  const adopted = container.querySelector('[data-ref="area"]');
  if (adopted) {
    adopted.classList.toggle("draft-readonly", Boolean(readOnly));
    adopted.classList.toggle("picks-only", Boolean(game.draft.picksOnly));
  } else {
    container.innerHTML = roomMarkup({ readOnly, picksOnly: Boolean(game.draft.picksOnly) });
  }
  view.refs = Object.fromEntries(
    [...container.querySelectorAll("[data-ref]")].map(element => [element.dataset.ref, element])
  );
  view.refs.search = container.querySelector("#draft-search");
  view.refs.laneCounts = new Map(
    [...container.querySelectorAll("[data-lane-count]")].map(element => [
      element.dataset.laneCount,
      element
    ])
  );
  view.refs.sides = {
    blue: container.querySelector(".dr-side.blue"),
    red: container.querySelector(".dr-side.red")
  };
  view.refs.search.addEventListener("input", () => {
    view.filter.search = view.refs.search.value;
    view.applyFilter();
  });
  // a lane of the bar is a toggle: a second click shows every lane again
  view.refs["lane-bar"].addEventListener("click", event => {
    const button = event.target.closest("[data-lane]");
    if (button) {
      view.filter.lane = view.filter.lane === button.dataset.lane ? "All" : button.dataset.lane;
      view.applyFilter();
    }
  });
  view.refs.role = container.querySelector("#draft-class");
  view.refs.role.addEventListener("change", () => {
    view.filter.role = view.refs.role.value;
    view.applyFilter();
  });
  return true;
}

export function readinessMarkup(ctx) {
  const { game, series, online, viewerTeamName } = ctx;
  const ready = game.draft.ready || { blue: false, red: false };
  const chip = side =>
    `<span class="ready-chip ${side}${ready[side] ? " is-ready" : ""}">${icon(ready[side] ? "check" : "clock", "i--sm")}${ready[side] ? (side === "blue" ? t("Blue ready") : t("Red ready")) : side === "blue" ? t("Blue not ready") : t("Red not ready")}</span>`;
  if (!online) {
    return `<span class="muted">${t("Both sides start together on this device.")}</span><button class="btn btn--primary btn--lg" data-action="start-local-draft" data-series-id="${escapeHtml(series.id)}">${icon("play")}${t("Start draft")}</button>`;
  }
  const side =
    game.blueTeam === viewerTeamName ? "blue" : game.redTeam === viewerTeamName ? "red" : null;
  const mine =
    side && !ready[side]
      ? `<button class="btn btn--primary btn--lg" data-action="start-side" data-side="${side}" data-series-id="${escapeHtml(series.id)}">${icon("play")}${t("I'm ready — start as {viewerTeamName}", { viewerTeamName: escapeHtml(viewerTeamName) })}</button>`
      : `<span class="muted">${side ? t("Waiting for your opponent…") : t("Spectating the ready check.")}</span>`;
  return `<div class="ready-chips">${chip("blue")}${chip("red")}</div><span class="muted">${t("The draft clock starts when both teams are ready.")}</span>${mine}`;
}

export function actionMarkup(ctx, step, actingTeam, canAct) {
  const { game, series, readOnly } = ctx;
  const draft = game.draft;
  const canEditDraft = ctx.viewer?.canRecordResult !== false;
  const edit = index =>
    canEditDraft
      ? `<button class="btn btn--sm" data-action="edit-draft" data-game-index="${index}">${icon("pencil", "i--sm")}${t("Edit bans &amp; picks")}</button>`
      : "";
  if (readOnly) {
    return edit(series.games.indexOf(game));
  }
  if (draft.started === false) {
    return readinessMarkup(ctx);
  }
  if (draft.phase === "draft") {
    const lane = step?.action === "pick" ? expectedLane(draft, step.team) : null;
    if (!canAct) {
      return `<span class="muted">${t("Waiting for {actingTeam}", { actingTeam: escapeHtml(actingTeam) })}</span>`;
    }
    return step.action === "pick"
      ? `<span class="muted">${t("Any hero can be picked, whatever its role · on time-out the auto-pick takes a {lane} hero", { lane: escapeHtml(lane ? laneLabel(lane) : t("free")) })}</span>`
      : `<span class="muted">${t("Select a hero to ban · if time runs out the ban is skipped (you can edit it later)")}</span>`;
  }
  if (draft.phase === "waiting") {
    return `<button class="btn btn--sm" data-action="advance-draft" data-series-id="${escapeHtml(series.id)}">${t("Finish wait")}</button>`;
  }
  // the draft is over: the clock is now the timer of the game itself
  const canTime = ctx.viewer?.canDrive !== false || Boolean(ctx.online);
  const running = game.gameTimer.status === "running";
  const button = (action, label, iconName, off) =>
    `<button type="button" class="btn btn--sm" data-action="${action}" data-series-id="${escapeHtml(series.id)}" ${canTime && !off ? "" : "disabled"}>${icon(iconName, "i--sm")}${label}</button>`;
  return `<span class="muted">${t("Draft locked in.")}</span><div class="dr-timer-controls">${button("timer-start", t("Start / resume game timer"), "play", running)}${button("timer-pause", t("Pause"), "pause", !running)}${button("timer-finish", t("Finish game timer"), "check", false)}</div>`;
}

export function resultMarkup(view, ctx) {
  const { series, game, viewer } = ctx;
  const canRecord = viewer?.canRecordResult !== false;
  const option = (side, teamName) =>
    `<label class="dr-team-option ${side}"><input type="radio" name="winner" value="${escapeHtml(teamName)}" required ${canRecord ? "" : "disabled"}><span>${teamEmblem(teamName, 56)}<b>${escapeHtml(teamName)}</b><small>${side === "blue" ? t("Blue side") : t("Red side")}</small></span></label>`;
  return `<section class="card dr-result-card"><div class="card__head"><h2>${t("Game result")}</h2><span class="pill">${t("Game {gameNumber}", { gameNumber: game.gameNumber })}</span>${canRecord ? `<button class="btn btn--sm" data-action="edit-draft" data-game-index="current">${icon("pencil", "i--sm")}${t("Edit bans &amp; picks")}</button>` : ""}</div>
      <form id="game-result-form" class="game-result" data-series-id="${escapeHtml(series.id)}">
        <fieldset class="dr-winner"><legend class="label">${t("Winner")}</legend>${option("blue", game.blueTeam)}${option("red", game.redTeam)}</fieldset>
        <label class="label">${t("Game duration · MM:SS")}<span class="field"><input id="game-duration" name="duration" value="${view.formatDuration(game.suggestedDurationSeconds ?? 0)}" pattern="\\d{1,3}:[0-5]\\d" required ${canRecord ? "" : "disabled"}></span></label>
        <button class="btn btn--primary btn--lg" type="submit" ${canRecord ? "" : "disabled"}>${icon("check")}${t("Save game result")}</button>
      </form>
      ${canRecord ? "" : `<p class="muted">${t("Only the creator of this online series records the result.")}</p>`}
    </section>`;
}

/** The draft in the order it happened: who took which hero, ban after ban and pick after pick. */
export function logMarkup(view, game) {
  const draft = game.draft;
  const bans = { blue: banSlots(draft, "blue"), red: banSlots(draft, "red") };
  const seen = { "blue:ban": 0, "red:ban": 0, "blue:pick": 0, "red:pick": 0 };
  const items = stepsOf(draft).map((step, index) => {
    const key = `${step.team}:${step.action}`;
    const heroId = (step.action === "ban" ? bans[step.team] : draft.picks[step.team])[seen[key]++];
    const hero = heroId ? view.getHero(heroId) : null;
    const side = step.team === "blue" ? t("Blue") : t("Red");
    const what = step.action === "ban" ? t("Ban") : t("Pick");
    return `<li class="dr-log__item ${step.team}${hero ? "" : " is-empty"}"><span class="dr-log__n">${index + 1}</span><span class="dr-log__who" title="${side} · ${what}">${icon(step.action === "ban" ? "ban" : "check", "i--sm")}<span class="visually-hidden">${side} · ${what}</span></span>${hero ? `<span class="pt pt--sq s-32">${view.imageMarkup(hero)}</span><b>${escapeHtml(hero.displayName || hero.name)}</b>` : `<span class="muted">${step.action === "ban" ? t("No ban") : "—"}</span>`}</li>`;
  });
  return `<div class="card__head"><h2>${t("Draft log")}</h2></div><ol class="dr-log__list">${items.join("")}</ol>`;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { mount, resultMarkup, logMarkup };
