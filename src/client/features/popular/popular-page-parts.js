// popular page, small helpers: heroOf, nameOf, day, ruleLabel, and 2 more.
import {
  MIN_PERIOD_MONTHS,
  addDays,
  addMonths,
  earliestEnd,
  spansEnough
} from "../../../shared/period.js";
import { currentLanguage, t } from "../../app/browser-i18n.js";

export const heroOf = (view, id) => view.state.heroes.find(hero => hero.id === id) ?? null;

export const nameOf = (view, id) => {
  const hero = view.heroOf(id);
  return hero ? hero.displayName || hero.name : id;
};

export const day = value =>
  new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`)
  );

export const ruleLabel = rule =>
  ({
    "global-ban-pick": t("Global Ban & Pick"),
    "free-for-all": t("Free For All"),
    classic: t("Classic")
  })[rule] ?? rule;

/** The period the person chose, as two days (a preset is counted back from today). */
export function chosenPeriod(view) {
  const today = localDay();
  if (view.ask.preset === "custom") {
    return { from: view.ask.from, to: view.ask.to };
  }
  if (view.ask.preset === "all") {
    const from = view.data?.period.first ?? addDays(addMonths(today, -MIN_PERIOD_MONTHS), 1);
    return { from, to: today >= earliestEnd(from) ? today : earliestEnd(from) };
  }
  return { from: addDays(addMonths(today, -Number(view.ask.preset)), 1), to: today };
}

/** `quiet`: the page the server drew is on screen with its data already in: it stays until the answer comes. */
export async function load(view, { quiet = false } = {}) {
  const { from, to } = view.chosenPeriod();
  view.problem = "";
  if (!from || !to) {
    view.problem = t("Choose the first and the last day of the period.");
  } else if (!spansEnough(from, to)) {
    view.problem = t("The period must span at least {months} months.", {
      months: MIN_PERIOD_MONTHS
    });
  }
  if (view.problem) {
    view.paint();
    return;
  }
  view.loading = true;
  if (!quiet) {
    view.paint();
  }
  const params = new URLSearchParams({ from, to, minGames: String(view.ask.minGames) });
  if (view.ask.rule) {
    params.set("rule", view.ask.rule);
  }
  try {
    view.data = await view.api(`/api/popular/${view.tab}?${params}`);
  } catch (error) {
    view.problem = error.message;
    view.tell(error.message);
  }
  view.loading = false;
  if (view.root?.isConnected) {
    view.paint();
  }
}

const localDay = () => {
  const now = new Date();
  const two = value => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { heroOf, nameOf, chosenPeriod, load };
