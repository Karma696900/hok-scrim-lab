// The clock of the draft: the time of the game and the turn, ticking once a second.
import { currentStep, timerState } from "../../../shared/draft-model.js";
import { t } from "../../app/browser-i18n.js";
import { setClass, setText } from "./draft-patch.js";

export function gameClock(game, now) {
  const timer = game.gameTimer;
  const running =
    timer.status === "running" ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0;
  return timer.elapsedBeforeStart + running;
}

/** Cheap per-tick refresh: clock text and state only. */
export function tick(view, ctx) {
  if (!view.refs) {
    return;
  }
  const { game, now } = ctx;
  const draft = game.draft;
  const state = timerState(draft, now);
  const step = currentStep(draft);
  // when the draft is over the clock is the timer of the game
  const stopwatch = draft.phase === "complete";
  setText(
    view.refs.timer,
    stopwatch
      ? view.formatDuration(gameClock(game, now))
      : state.name === "idle"
        ? view.formatDuration(draft.secondsPerAction) // the time every action will have
        : state.name === "done"
          ? t(state.label)
          : state.label
  );
  const total = draft.phase === "waiting" ? draft.waitingSeconds : draft.secondsPerAction;
  const share =
    state.name === "normal" || state.name === "warning"
      ? Math.min(1, Math.max(0, (draft.deadline - now) / (total * 1000)))
      : state.name === "expired"
        ? 0
        : stopwatch && game.gameTimer.status === "running"
          ? 1
          : 0;
  view.refs.bar.style.setProperty("--p", String(Math.round(share * 1000) / 10));
  const className = `timer timer--${state.name}`;
  if (view.refs.timer.className !== className) {
    view.refs.timer.className = className;
  }
  // The state is also written in words (a colour alone is not enough): CSS shows it after the digits.
  const note = stopwatch
    ? t("Game timer")
    : state.name === "warning"
      ? t("LAST 5 SECONDS")
      : state.name === "expired"
        ? t("TIME UP")
        : "";
  if (view.refs.timer.dataset.note !== note) {
    view.refs.timer.dataset.note = note;
  }
  setClass(view.refs.clock, "warn", state.name === "warning" || state.name === "expired");
  setClass(view.refs.clock, "idle", state.name === "idle");
  if (view.lastTimerName !== state.name) {
    if (state.name === "warning") {
      setText(view.refs.live, t("Five seconds left."));
    }
    if (state.name === "expired" && view.lastTimerName !== null) {
      setText(
        view.refs.live,
        step?.action === "ban"
          ? t("Time is up. The ban is skipped.")
          : t("Time is up. A hero is picked automatically.")
      );
    }
    view.lastTimerName = state.name;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { tick };
