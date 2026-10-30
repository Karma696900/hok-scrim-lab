// What happens when a person acts on the page: clicks, typing, keys, submit.
import { compactBans, emptyGame, emptySeries, toDraft } from "./tournament-model.js";
import { t } from "../../app/browser-i18n.js";
import { other, sameSlot } from "./tournament-parts.js";

/** The buttons that start and close an editor, and the ones that propose the lanes of many series. True when one was pressed. */
function seriesButtons(view, target) {
  if (target.matches("[data-new]")) {
    view.editor = emptySeries();
    view.active = null;
    view.error = "";
    view.paint();
    view.showEditor();
    view.root.querySelector('[name="event"]')?.focus({ preventScroll: true });
    return true;
  }
  if (target.matches("[data-cancel]")) {
    view.editor = null;
    view.active = null;
    view.error = "";
    view.paint();
    return true;
  }
  if (target.matches("[data-suggest-all]")) {
    target.disabled = true;
    view
      .prepareProposal()
      .then(view.paint)
      .catch(problem => {
        view.tell(problem.message);
        view.paint();
      });
    return true;
  }
  if (target.matches("[data-suggest-cancel]")) {
    view.proposal = null;
    view.paint();
    return true;
  }
  if (target.matches("[data-suggest-apply]") && view.proposal) {
    const todo = view.proposal;
    target.disabled = true;
    (async () => {
      for (const item of todo) {
        await view.api(`/api/admin/tournaments/${encodeURIComponent(item.series.id)}`, {
          method: "PUT",
          body: view.bodyOf(item.series)
        });
      }
      view.proposal = null;
      view.tell(
        t("Lanes saved on {count, plural, one {# series} other {# series}}", {
          count: todo.length
        })
      );
      await view.reload();
      view.paint();
    })().catch(problem => view.tell(problem.message));
    return true;
  }
  return false;
}

/** The buttons of the list: the filter, an event of the summary, edit, delete, the page. True when one was pressed. */
function listButtons(view, target) {
  if (target.dataset.verify !== undefined) {
    view.verify = target.dataset.verify;
    view.page = 1;
    view
      .reload()
      .then(view.paint)
      .catch(problem => view.tell(problem.message));
    return true;
  }
  if (target.dataset.event !== undefined) {
    // an event of the summary: the table keeps the series of this event (an empty name shows them all)
    view.query = target.dataset.event;
    view.page = 1;
    view
      .reload()
      .then(view.paint)
      .catch(problem => view.tell(problem.message));
    return true;
  }
  if (target.dataset.edit) {
    view
      .api(`/api/admin/tournaments/${encodeURIComponent(target.dataset.edit)}`)
      .then(series => {
        view.editor = toDraft(series);
        view.active = null;
        view.error = "";
        view.paint();
        // the "Lanes" button of a row opens the same editor, already on the lanes of the first game
        // that still misses some
        const lanes = target.hasAttribute("data-roles")
          ? view.root.querySelectorAll(".palette-bar")
          : [];
        const first =
          [...lanes].find((_, at) =>
            /todo/.test(view.root.querySelectorAll(".lane-status")[at]?.innerHTML ?? "")
          ) ?? lanes[0];
        if (first) {
          first.scrollIntoView({ block: "center" });
        } else {
          view.showEditor();
        }
      })
      .catch(problem => view.tell(problem.message));
    return true;
  }
  if (target.dataset.delete) {
    if (!confirm(t("Delete this series and its games? Hero statistics change accordingly."))) {
      return;
    }
    view
      .api(`/api/admin/tournaments/${encodeURIComponent(target.dataset.delete)}`, {
        method: "DELETE"
      })
      .then(async () => {
        view.tell(t("Series deleted"));
        await view.reload();
        view.paint();
      })
      .catch(problem => view.tell(problem.message));
    return true;
  }
  if (target.dataset.page) {
    view.page = Number(target.dataset.page);
    view
      .reload()
      .then(view.paint)
      .catch(problem => view.tell(problem.message));
    return true;
  }
  return false;
}

/** The buttons inside the editor of a series: lanes, slots, winner, swap, add or remove a game. */
function editorButtons(view, target) {
  if (target.dataset.suggest !== undefined) {
    const game = view.editor.games[Number(target.dataset.suggest)];
    const filled = game ? view.suggestForGame(game) : 0;
    view.paint();
    view.tell(
      filled
        ? t(
            "{count, plural, one {# lane proposed} other {# lanes proposed}}: change them by dragging.",
            { count: filled }
          )
        : t("Nothing more can be proposed with certainty: slide the lanes yourself.")
    );
    return;
  }
  if (target.dataset.laneTool !== undefined) {
    view.armed = view.armed === target.dataset.laneTool ? null : target.dataset.laneTool;
    view.paint();
    view.root.querySelector(`[data-lane-tool="${CSS.escape(target.dataset.laneTool)}"]`)?.focus();
    return;
  }
  if (target.dataset.laneCell) {
    // a lane in hand goes onto the hero of this cell
    if (view.armed !== null) {
      const [game, side, index] = target.dataset.laneCell.split(":");
      if (view.setLane(Number(game), side, Number(index), view.armed)) {
        view.armed = null;
        view.paint();
        view.root.querySelector(`[data-lane-cell="${target.dataset.laneCell}"]`)?.focus();
      }
    }
    return;
  }
  if (view.armed !== null && target.dataset.slot) {
    // ... or onto the hero's picture
    const [game, group, side, index] = target.dataset.slot.split(":");
    if (group === "picks" && view.setLane(Number(game), side, Number(index), view.armed)) {
      view.armed = null;
      view.paint();
      view.root.querySelector(`[data-lane-cell="${game}:${side}:${index}"]`)?.focus();
      return;
    }
  }
  if (target.dataset.slot) {
    const [game, group, side, index] = target.dataset.slot.split(":");
    const slot = { game: Number(game), group, side, index: Number(index) };
    const current = view.editor.games[slot.game][group][side][slot.index];
    if (current && view.active && sameSlot(view.active, slot)) {
      // a second click on a filled, active slot empties it
      const game = view.editor.games[slot.game];
      game[group][side][slot.index] = null;
      if (group === "picks") {
        game.lanes[side][slot.index] = null;
      }
      if (group === "bans") {
        compactBans(game);
        slot.index = game.bans[side].filter(Boolean).length;
      }
    }
    view.active = slot;
    view.search = "";
    view.paint();
  } else if (target.dataset.pick) {
    if (view.active) {
      view.pick(target.dataset.pick);
    }
  } else if (target.dataset.winner) {
    const [game, token] = target.dataset.winner.split(":");
    const entry = view.editor.games[Number(game)];
    entry.winner = entry.winner === token ? "" : token;
    view.paint();
  } else if (target.dataset.ultimate) {
    const entry = view.editor.games[Number(target.dataset.ultimate)];
    entry.ultimateBattle = !entry.ultimateBattle;
    view.paint();
  } else if (target.dataset.swap) {
    const entry = view.editor.games[Number(target.dataset.swap)];
    entry.blue = other(entry.blue);
    [entry.picks.blue, entry.picks.red] = [entry.picks.red, entry.picks.blue];
    [entry.bans.blue, entry.bans.red] = [entry.bans.red, entry.bans.blue];
    [entry.lanes.blue, entry.lanes.red] = [entry.lanes.red, entry.lanes.blue];
    entry.winner = entry.winner ? other(entry.winner) : "";
    view.paint();
  } else if (target.dataset.removeGame) {
    view.editor.games.splice(Number(target.dataset.removeGame), 1);
    view.active = null;
    view.paint();
  } else if (target.matches("[data-add-game]")) {
    const last = view.editor.games[view.editor.games.length - 1];
    view.editor.games.push(emptyGame(other(last.blue))); // sides usually alternate between games
    view.active = { game: view.editor.games.length - 1, group: "picks", side: "blue", index: 0 };
    view.search = "";
    view.paint();
  }
}

export function onClick(view, event) {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }
  if (seriesButtons(view, target) || listButtons(view, target)) {
    return;
  }
  if (!view.editor) {
    return;
  }
  view.readFields();
  editorButtons(view, target);
}

export function onInput(view, event) {
  if (event.target.id === "picker-search") {
    view.search = event.target.value;
    view.refreshGrid();
  } else if (event.target.id === "series-query") {
    clearTimeout(view.timer);
    view.timer = setTimeout(() => {
      view.query = event.target.value.trim();
      view.page = 1;
      view
        .reload()
        .then(() => {
          view.paint();
          const input = view.root.querySelector("#series-query");
          input?.focus();
          input?.setSelectionRange(view.query.length, view.query.length);
        })
        .catch(problem => view.tell(problem.message));
    }, 250);
  }
}

export function onChange(view, event) {
  if (
    !view.editor ||
    !event.target.closest("#series-form") ||
    event.target.id === "picker-search"
  ) {
    return;
  }
  // No repaint here: it would take the focus away from the field the typist is moving to. Team
  // names reach the buttons at the next repaint.
  view.readFields();
  const add = view.root.querySelector("[data-add-game]");
  if (add) {
    add.disabled = view.editor.games.length >= view.editor.bestOf;
  }
}

// On the document: a repaint removes the focused button, and the keys then go to the body.
export function onKeydown(view, event) {
  if (!view.editor || !view.root?.isConnected) {
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    view.save(false);
    return;
  }
  if (event.key === "Escape" && view.armed !== null && event.target.id !== "picker-search") {
    view.armed = null;
    view.paint();
    return;
  }
  if (event.target.id === "picker-search") {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = view.root.querySelector(".picker-hero:not([disabled])");
      if (first && view.active) {
        view.pick(first.dataset.pick);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      view.active = null;
      view.search = "";
      view.paint();
    }
  }
}

export function onSubmit(view, event) {
  if (event.target.id !== "series-form") {
    return;
  }
  event.preventDefault();
  view.save(event.submitter?.dataset.save === "next");
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onInput, onChange, onKeydown, onSubmit };
