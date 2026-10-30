// The editor of a series: its fields, its body for the server, saving, picking a hero.
import {
  BEST_OF,
  RELIABILITY,
  RULES,
  compactBans,
  emptySeries,
  seconds
} from "./tournament-model.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { laneBody, orderOf, other, sameSlot, scoreOf } from "./tournament-parts.js";
import { pickerGrid } from "./tournament-game.js";

// ---- the editor of a series: the series on the left, its games on the right -----------------------

export const editorMarkup = view => {
  const score = scoreOf(view.editor);
  const names = `<datalist id="team-names">${view.suggestions.teams.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist><datalist id="event-names">${view.suggestions.events.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>`;
  const field = (label, control) =>
    `<label class="label">${label}<span class="field">${control}</span></label>`;
  return `<form id="series-form" class="tn-editor" novalidate>
      <aside class="ws-panel tn-meta" aria-labelledby="editor-title">
        <div class="ws-panel__head"><h2 id="editor-title">${view.editor.id ? t("Edit series") : t("New series")}</h2><span class="pill">${escapeHtml(view.teamName("A"))} ${score.A} – ${score.B} ${escapeHtml(view.teamName("B"))}</span></div>
        <div class="ws-panel__body ws-form">${names}
          ${field(t("Event"), `<input name="event" list="event-names" maxlength="160" required value="${escapeHtml(view.editor.event)}" autocomplete="off">`)}
          ${field(t("Stage"), `<input name="stage" maxlength="80" placeholder="${t("Final, Group A…")}" value="${escapeHtml(view.editor.stage)}">`)}
          ${field(t("Date played"), `<input type="date" name="playedOn" required value="${escapeHtml(view.editor.playedOn)}">`)}
          ${field(t("Patch (optional)"), `<input name="patch" maxlength="40" value="${escapeHtml(view.editor.patch)}">`)}
          ${field(t("Team A"), `<input name="teamA" list="team-names" maxlength="80" required value="${escapeHtml(view.editor.teamA)}" autocomplete="off">`)}
          ${field(t("Team B"), `<input name="teamB" list="team-names" maxlength="80" required value="${escapeHtml(view.editor.teamB)}" autocomplete="off">`)}
          ${field(t("Best of"), `<select name="bestOf">${BEST_OF.map(count => `<option value="${count}"${count === view.editor.bestOf ? " selected" : ""}>${count}</option>`).join("")}</select>`)}
          ${field(t("Draft rule"), `<select name="rule">${RULES.map(([value, label]) => `<option value="${value}"${view.editor.rule === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`)}
          ${field(t("Source (https address)"), `<input type="url" name="sourceUrl" maxlength="500" required value="${escapeHtml(view.editor.sourceUrl)}">`)}
          ${field(t("Note (optional)"), `<input name="note" maxlength="500" value="${escapeHtml(view.editor.note)}">`)}
          ${field(t("Reliability"), `<select name="verification">${RELIABILITY.map(([value, , , label]) => `<option value="${value}"${view.editor.verification === value ? " selected" : ""}>${escapeHtml(label())}</option>`).join("")}</select>`)}
          <div class="chip-checks"><label class="chip-check"><input type="checkbox" name="pickOrderKnown"${view.editor.pickOrderKnown ? " checked" : ""}><span>${t("The order of the picks is known")}</span></label></div>
          ${view.editor.toCheck.length && view.editor.verification !== "verified" ? `<div class="tn-tocheck"><b>${t("To check")}</b><ul>${view.editor.toCheck.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>` : ""}
        </div>
        <div class="ws-panel__foot">
          <p class="form-error" role="alert">${escapeHtml(view.error)}</p>
          <button type="submit" class="btn btn--primary" data-save="stay">${icon("check")}${t("Save series")}</button>
          ${view.editor.id ? "" : `<button type="submit" class="btn" data-save="next">${t("Save and enter the next series")}</button>`}
          <button type="button" class="btn btn--ghost" data-cancel>${t("Cancel")}</button>
          <span class="muted">${t("Ctrl+Enter saves.")}</span>
        </div>
      </aside>
      <div class="tn-games">
        ${view.editor.games.map(view.gameMarkup).join("")}
        <div class="hstack wrap tn-games__add"><button type="button" class="btn" data-add-game ${view.editor.games.length >= view.editor.bestOf ? "disabled" : ""}>${icon("plus")}${t("Add a game")}</button></div>
      </div>
    </form>`;
};

/** Keeps what was typed in the fields (the form is repainted when a slot or a button changes). */
export function readFields(view) {
  const form = view.root.querySelector("#series-form");
  if (!form) {
    return;
  }
  const data = new FormData(form);
  for (const key of [
    "event",
    "stage",
    "playedOn",
    "patch",
    "sourceUrl",
    "note",
    "teamA",
    "teamB"
  ]) {
    view.editor[key] = String(data.get(key) ?? "");
  }
  view.editor.bestOf = Number(data.get("bestOf")) || view.editor.bestOf;
  view.editor.rule = data.get("rule") || "free-for-all";
  view.editor.verification = data.get("verification") || view.editor.verification;
  view.editor.pickOrderKnown = data.get("pickOrderKnown") !== null;
  view.root.querySelectorAll("[data-duration]").forEach(input => {
    view.editor.games[Number(input.dataset.duration)].duration = input.value;
  });
}

export function pick(view, heroId) {
  const game = view.editor.games[view.active.game];
  if (view.usedIn(game).has(heroId)) {
    return;
  }
  game[view.active.group][view.active.side][view.active.index] = heroId;
  if (view.active.group === "bans") {
    compactBans(game);
  }
  const order = orderOf(view.active.game);
  const from = order.findIndex(slot => sameSlot(slot, view.active));
  // Next free slot, picks before bans, wrapping once; none left closes the picker.
  const next = [...order.slice(from + 1), ...order.slice(0, from)].find(
    slot =>
      !game[slot.group][slot.side][slot.index] &&
      (slot.group === "picks" || view.active.group === "bans")
  );
  view.active = next ?? null;
  view.search = "";
  view.paint();
}

export const refreshGrid = view => {
  const grid = view.root.querySelector("#picker-grid");
  if (!grid || !view.active) {
    return;
  }
  grid.innerHTML = pickerGrid(
    view.heroes().filter(view.matches),
    view.usedIn(view.editor.games[view.active.game])
  );
};

export function bodyOf(view, source = view.editor) {
  const names = { A: source.teamA.trim(), B: source.teamB.trim() };
  return {
    event: source.event,
    stage: source.stage,
    playedOn: source.playedOn,
    patch: source.patch,
    sourceUrl: source.sourceUrl,
    note: source.note,
    verification: source.verification,
    pickOrderKnown: source.pickOrderKnown,
    // checked by a person: nothing is left to check
    toCheck: source.verification === "verified" ? [] : source.toCheck,
    teamA: names.A,
    teamB: names.B,
    bestOf: source.bestOf,
    rule: source.rule,
    games: source.games.map((game, position) => {
      const durationSeconds = seconds(game.duration);
      if (Number.isNaN(durationSeconds)) {
        throw new Error(t("Use MM:SS, for example 24:37"));
      }
      if (!game.winner) {
        throw new Error(t("Choose the winner of every game."));
      }
      return {
        blueTeam: names[game.blue],
        redTeam: names[other(game.blue)],
        winner: names[game.winner],
        ultimateBattle:
          Boolean(game.ultimateBattle) &&
          source.rule === "global-ban-pick" &&
          position === source.games.length - 1 &&
          source.games.length === source.bestOf,
        durationSeconds,
        picks: { blue: game.picks.blue.filter(Boolean), red: game.picks.red.filter(Boolean) },
        pickLanes: laneBody(game),
        bans: { blue: game.bans.blue.filter(Boolean), red: game.bans.red.filter(Boolean) }
      };
    })
  };
}

export async function save(view, again) {
  if (view.busy) {
    return;
  }
  view.readFields();
  view.error = "";
  view.busy = true;
  try {
    const body = view.bodyOf();
    if (view.editor.id) {
      await view.api(`/api/admin/tournaments/${encodeURIComponent(view.editor.id)}`, {
        method: "PUT",
        body
      });
    } else {
      await view.api("/api/admin/tournaments", { method: "POST", body });
    }
    view.tell(t("Series saved"));
    const carry = view.editor;
    view.editor = again ? emptySeries(carry) : null;
    view.active = null;
    view.search = "";
    await view.reload();
    view.paint();
    if (again) {
      view.root.querySelector('[name="teamA"]')?.focus();
    }
  } catch (problem) {
    view.error = problem.message;
    view.paint();
    view.root.querySelector(".form-error")?.scrollIntoView({ block: "nearest" });
  } finally {
    view.busy = false;
  }
}

/** The editor opens under the stage: the series on the left and its games on the right fill the screen. */
export const showEditor = view =>
  view.root.querySelector(".tn-editor")?.scrollIntoView({ block: "start", behavior: "instant" });

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { editorMarkup, readFields, pick, refreshGrid, bodyOf, save, showEditor };
