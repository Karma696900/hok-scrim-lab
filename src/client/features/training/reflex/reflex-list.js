// The list of exercises.
import { EXERCISES, ROUTINES } from "../../../../shared/reflex-model.js";
import { daysText, minutesText, routineName, runsText } from "../../../domain/reflex-labels.js";
import { escapeHtml as esc } from "../../../lib/escape.js";
import { icon } from "../../../../shared/icons.js";
import { number, t } from "../../../app/browser-i18n.js";
import { zoneHead } from "../training-shared.js";
import { assignments, exerciseCard, startsRoutine } from "./reflex-parts.js";

// ---- the list of exercises ---------------------------------------------------------------------
export function showList(view, root, summary) {
  const stat = (iconName, main, note) =>
    `<div class="stat"><span class="ico">${icon(iconName)}</span><span><b>${main}</b><small>${note}</small></span></div>`;
  const card = exercise => exerciseCard(exercise, summary);
  root.innerHTML = `${view.kit.chrome({
    zone: "reflex",
    ...zoneHead("reflex"),
    // the figures of this zone, not the ones of the heroes and the combos (they are on the first page of the area)
    figures: [
      [number(EXERCISES.length), t("Exercises")],
      [number(ROUTINES.length), t("Routines")],
      [`${number(summary.doneToday.length)}/${number(EXERCISES.length)}`, t("Played today")]
    ]
  })}
      <div class="rx-page">
        <div class="rx-top">
          <div class="rx-stats rise d-1">
            ${stat("clock", runsText(summary.today.runs), `${t("Today")} · ${minutesText(summary.today.minutes)}`)}
            ${stat("calendar", runsText(summary.week.runs), `${t("This week")} · ${minutesText(summary.week.minutes)}`)}
            ${stat("flame", daysText(summary.streak), t("Streak"))}
          </div>
          <section class="card rise d-2 rx-banner">
            <div class="rx-banner__head"><div><h2>${t("Routines")}</h2><p class="muted">${t("Play several exercises in a row, each one after the other, and see how you did at the end.")}</p></div><a class="btn btn--primary" href="/training/reflex/routine">${icon("play", "i--sm")}${t("Choose a routine")}</a></div>
            <ul class="rx-quick">${ROUTINES.map(item => `<li><button type="button" class="rx-quick__item" data-routine="${item.id}">${icon("play", "i--sm")}<span>${esc(routineName(item.id))}</span><small>${number(item.exercises.length)}</small></button></li>`).join("")}</ul>
          </section>
        </div>
        ${assignments(summary.teams)}
        <div class="rx-list rise d-3">${EXERCISES.map(card).join("")}</div>
        <div id="rx-ranking-slot" class="rx-ranking-slot" hidden></div>
      </div>`;
  view.kit.paintChrome();
  root.onclick = startsRoutine(view, root, summary);
  view.ranking.fill(root.querySelector("#rx-ranking-slot"));
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { showList };
