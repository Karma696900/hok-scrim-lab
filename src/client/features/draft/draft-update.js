// Bringing the board up to date with the draft (each poll and each tick).
import {
  banSlots,
  currentStep,
  heroAvailability,
  nextBanIndex,
  pickSlots
} from "../../../shared/draft-model.js";
import { classLabel, laneLabel, laneLogos } from "../../domain/lanes.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { teamEmblem } from "../../domain/team-emblem.js";
import { actionMarkup } from "./draft-room-markup.js";
import { patch, setClass, setText } from "./draft-patch.js";

const SIDES = ["blue", "red"];

/** Why a hero is out of reach for the side that plays: banned, taken by a side, or used earlier in the series. */
export function takenBy(heroId, draft, result) {
  if (result.label === "Used in series") {
    return "series";
  }
  if (result.label !== "Used this game") {
    return "";
  }
  if (draft.bans.blue.includes(heroId) || draft.bans.red.includes(heroId)) {
    return "ban";
  }
  return draft.picks.blue.includes(heroId) ? "blue" : "red";
}

/** What the board needs to know about the draft, read once for the whole update. */
function factsOf(ctx) {
  const { series, game, readOnly } = ctx;
  const draft = game.draft;
  const started = draft.started !== false;
  const step = currentStep(draft);
  const actingTeam = step ? (step.team === "blue" ? game.blueTeam : game.redTeam) : "";
  const animate = !readOnly;
  // Classic: in an online duo the server already left the other side's picks out (it only says
  // how many); on one shared screen the side that is not playing is hidden.
  const hiddenOnline = side => draft.hiddenPicks?.[side] ?? 0;
  const hiddenLocal = side =>
    !readOnly &&
    draft.gameMode === "classic" &&
    series.draftMode === "two-players" &&
    draft.phase === "draft" &&
    step?.team !== side;
  const pickCount = side => draft.picks[side].length + hiddenOnline(side);

  const online = Boolean(ctx.online);
  const live = !readOnly && started && draft.phase === "draft";
  const canAct = live && (online ? ctx.canActAs === step?.team : ctx.viewer?.canDrive !== false);
  const timerLabel = readOnly
    ? t("Final board")
    : !started
      ? t("Draft ready")
      : draft.phase === "waiting"
        ? t("Final wait")
        : draft.phase === "complete"
          ? t("Draft complete")
          : `${actingTeam} · ${step.action === "ban" ? t("ban") : t("pick")}`;
  return {
    series,
    game,
    readOnly,
    draft,
    started,
    step,
    actingTeam,
    animate,
    hiddenOnline,
    hiddenLocal,
    pickCount,
    live,
    canAct,
    timerLabel
  };
}

/** One side of the room: the name and the emblem of the team, its bans and its picks. */
function updateSide(view, facts, side) {
  const { game, readOnly, draft, started, step, animate, hiddenOnline, hiddenLocal, pickCount } =
    facts;
  const teamName = side === "blue" ? game.blueTeam : game.redTeam;
  setText(view.refs[`${side}-name`], teamName);
  patch(view.refs[`${side}-emblem`], teamEmblem(teamName, 56));
  const active = started && draft.phase === "draft" && step?.team === side && !readOnly;
  setClass(view.refs.sides[side], "is-turn", active);
  const nextBan = nextBanIndex(draft, side);
  banSlots(draft, side).forEach((heroId, index) => {
    const slot = view.refs[`${side}-bans`].children[index];
    view.setSlot(
      slot,
      heroId,
      t("{side} ban {number}", {
        side: side === "blue" ? t("Blue") : t("Red"),
        number: index + 1
      }),
      animate
    );
    setClass(slot, "next", active && step.action === "ban" && index === nextBan);
  });
  const concealedCount = hiddenLocal(side) ? draft.picks[side].length : hiddenOnline(side);
  pickSlots(draft, side).forEach(({ lane, rank, heroId: pickedId }, index) => {
    const slot = view.refs[`${side}-picks`].children[index];
    const concealed = hiddenLocal(side)
      ? index < concealedCount
      : !pickedId && index < concealedCount;
    const heroId = hiddenLocal(side) ? null : pickedId;
    view.setSlot(
      slot,
      heroId,
      t("{side} pick {number}", { side: side === "blue" ? t("Blue") : t("Red"), number: rank }),
      animate
    );
    const hero = heroId ? view.getHero(heroId) : null;
    const isNext = active && step.action === "pick" && index === pickCount(side);
    // A filled card shows the hero, its classes and every lane it can play (a hero may be Clash
    // Lane and Jungle); an empty one shows the lane the auto-pick would take.
    setText(slot.querySelector(".pick-lane-label"), heroId || concealed ? "" : laneLabel(lane));
    setClass(slot, "concealed", concealed);
    // the logos of a hero of several lanes are smaller, so that they stay in the column of the others
    const logos = hero ? hero.lanes : [lane];
    patch(
      slot.querySelector(".slot-lanes"),
      concealed ? icon("lock") : laneLogos(logos, logos.length > 1 ? 18 : 22)
    );
    if (concealed) {
      slot.setAttribute(
        "aria-label",
        `${t("{side} pick {number}", { side: side === "blue" ? t("Blue") : t("Red"), number: rank })}: ${t("Hidden pick")}`
      );
    }
    setText(
      slot.querySelector(".slot-name"),
      concealed
        ? t("Hidden pick")
        : hero
          ? hero.displayName || hero.name
          : isNext
            ? t("Next pick")
            : t("Waiting")
    );
    setText(
      slot.querySelector(".slot-sub"),
      concealed
        ? t("Revealed at the end of the draft")
        : hero
          ? (hero.roles ?? []).map(classLabel).join(" · ")
          : t("Pick {number} of 5", { number: rank })
    );
    setClass(slot, "next", active && step.action === "pick" && index === pickCount(side));
  });
  setText(view.refs[`${side}-ban-count`], `${draft.bans[side].length} / 5`);
  setText(
    view.refs[`${side}-pick-count`],
    `${hiddenLocal(side) ? draft.picks[side].length : pickCount(side)} / 5`
  );
}

/** The middle of the room: what the clock says, whose turn it is, the action bar and the clock. */
function updateCentre(view, ctx, facts) {
  const { game, readOnly, draft, started, step, actingTeam, canAct, timerLabel } = facts;
  setText(view.refs.phase, timerLabel);
  setText(
    view.refs.turn,
    readOnly
      ? game.winner
        ? t("{winner} won", { winner: game.winner })
        : t("Recorded")
      : !started
        ? t("Ready check")
        : draft.phase === "draft"
          ? t("{team}'s turn", { team: actingTeam })
          : draft.phase === "waiting"
            ? t("Next game briefing")
            : t("Result entry")
  );
  patch(view.refs.action, actionMarkup(ctx, step, actingTeam, canAct));
  setClass(view.refs.clock, "done", readOnly || draft.phase === "complete");
  if (readOnly) {
    // a game that is over: the clock shows how long it lasted
    setText(
      view.refs.timer,
      game.durationSeconds === undefined ? "—" : view.formatDuration(game.durationSeconds)
    );
    view.refs.timer.className = "timer timer--done";
    view.refs.timer.dataset.note = game.durationSeconds === undefined ? "" : t("Duration");
    view.refs.bar.style.setProperty("--p", "0");
  } else {
    view.tick(ctx);
  }
}

/** The pool of heroes: there from the ready check to the final wait; each card follows what the acting side may take. */
function updatePool(view, ctx, facts) {
  const { series, readOnly, draft, step, actingTeam, live, canAct, timerLabel } = facts;
  const { heroes } = ctx;
  // Hero pool: there from the ready check to the final wait (dimmed while nobody can take a hero)
  const showPool = !readOnly && draft.phase !== "complete";
  if (view.refs.pool.hidden === showPool) {
    view.refs.pool.hidden = !showPool;
  }
  setClass(view.refs.area, "with-pool", showPool); // the pool takes the middle of the board (see draft.css)
  setClass(view.refs.area, "pool-asleep", showPool && !live);
  if (showPool) {
    if (!view.cards.size) {
      view.buildPool(heroes);
    }
    const usedByActingTeam = actingTeam === series.teamA.name ? ctx.usedA : ctx.usedB;
    let available = 0;
    const perLane = new Map(); // the heroes that can still be taken, in each lane
    for (const card of view.cards.values()) {
      const result = heroAvailability({
        hero: card.hero,
        draft,
        series,
        usedByActingTeam,
        flowbornIds: ctx.flowbornIds,
        canAct
      });
      // a card only does something while the draft runs: in the ready check and in the final wait the pool is
      // there to be looked at, and its cards carry no action
      if (card.awake !== live) {
        card.awake = live;
        if (live) {
          card.button.dataset.action = "draft-pick";
        } else {
          card.button.removeAttribute("data-action");
        }
      }
      const taken = takenBy(card.hero.id, draft, result);
      const stateKey = `${result.blocked}|${result.label}|${taken}`;
      if (
        card.state !== stateKey &&
        card.state === null &&
        !result.blocked &&
        !result.label &&
        !taken
      ) {
        // a hero nobody has touched: the card is already what the markup made it (most of the pool, at the first draw)
        card.state = stateKey;
        const named = card.hero.displayName || card.hero.name;
        if (named !== card.hero.name) {
          card.button.setAttribute("aria-label", named);
        }
      } else if (card.state !== stateKey) {
        card.state = stateKey;
        card.button.disabled = result.blocked;
        setClass(card.button, "disabled", result.blocked);
        // A hero that is gone (banned, picked, used in the series) is crossed out; one that is
        // merely not available to this person yet (it is not their turn) is only dimmed.
        setClass(card.button, "used", result.blocked && result.label !== "Waiting");
        card.button.dataset.taken = taken;
        card.badge.innerHTML = taken
          ? icon(taken === "ban" ? "ban" : taken === "series" ? "lock" : "check", "i--sm")
          : "";
        const stateText = result.label ? t(result.label) : "";
        card.stateLabel.hidden = !stateText;
        card.stateLabel.textContent = stateText;
        const base = card.hero.displayName || card.hero.name;
        card.button.setAttribute(
          "aria-label",
          `${base}${stateText ? `, ${stateText.toLocaleLowerCase()}` : ""}`
        );
      }
      // the counts of the lanes are those of the heroes still free, whoever's turn it is
      const free = !taken;
      if (free) {
        for (const lane of card.hero.lanes ?? []) {
          perLane.set(lane, (perLane.get(lane) ?? 0) + 1);
        }
      }
      if (!result.blocked && !card.button.hidden) {
        available += 1;
      }
    }
    for (const [lane, element] of view.refs.laneCounts) {
      setText(element, String(perLane.get(lane) ?? 0));
    }
    setText(
      view.refs["pool-title"],
      step && live
        ? t("Hero pool · {action} · {team}", {
            action: step.action === "ban" ? t("Ban") : t("Pick"),
            team: actingTeam
          })
        : timerLabel
    );
    setText(
      view.refs["pool-count"],
      live ? t("{count} available", { count: available }) : timerLabel
    );
  }
}

/** The result entry (current game only) and the log of a draft that is over. */
function updateResult(view, ctx, facts) {
  const { game, readOnly, draft } = facts;
  // Result entry (current game only) and the log of a draft that is over
  const showResult = !readOnly && draft.phase === "complete";
  setClass(view.refs.area, "with-result", showResult);
  if (showResult && !view.resultBuilt) {
    view.refs.result.innerHTML = view.resultMarkup(ctx);
    view.resultBuilt = true;
    view.lastSuggested = game.suggestedDurationSeconds ?? 0;
  }
  if (!showResult && view.resultBuilt) {
    view.refs.result.innerHTML = "";
    view.resultBuilt = false;
  }
  if (view.resultBuilt) {
    const input = view.refs.result.querySelector("#game-duration");
    const suggested = game.suggestedDurationSeconds ?? 0;
    if (input && suggested !== view.lastSuggested) {
      input.value = view.formatDuration(suggested);
      view.lastSuggested = suggested;
    }
  }
  const showLog = readOnly || draft.phase === "complete";
  if (view.refs.log.hidden === showLog) {
    view.refs.log.hidden = !showLog;
  }
  if (showLog) {
    patch(view.refs.log, view.logMarkup(game));
  }
}

/** The screen-reader announcement of the latest action. */
function announceLatest(view, facts) {
  const { game, readOnly, draft, hiddenOnline, hiddenLocal } = facts;
  // Screen-reader announcement of the latest action
  if (draft.actions.length > view.lastActions && !readOnly) {
    const latest = draft.actions.at(-1);
    const hero = latest.heroId ? view.getHero(latest.heroId) : null;
    const team = latest.team === "blue" ? game.blueTeam : game.redTeam;
    const heroName = hero ? hero.displayName || hero.name : "";
    const sentence =
      latest.action === "ban"
        ? hero
          ? t("{team} banned {hero}.", { team, hero: heroName })
          : t("{team} skipped the ban.", { team })
        : hero
          ? t("{team} picked {hero}.", { team, hero: heroName })
          : latest.timedOut || !(hiddenOnline(latest.team) || hiddenLocal(latest.team))
            ? t("{team} picked no hero.", { team })
            : t("{team} picked a hero.", { team });
    setText(view.refs.live, latest.timedOut ? `${sentence} ${t("(time ran out)")}` : sentence);
  }
  view.lastActions = draft.actions.length;
}

export function update(view, ctx) {
  const facts = factsOf(ctx);
  for (const side of SIDES) {
    updateSide(view, facts, side);
  }
  updateCentre(view, ctx, facts);
  updatePool(view, ctx, facts);
  updateResult(view, ctx, facts);
  announceLatest(view, facts);
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { update };
