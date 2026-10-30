// Sliding a lane onto a hero (clicking a logo, then a hero, does the same without a pointer drag).
import { cellOf } from "./tournament-parts.js";

export function onDragStart(view, event) {
  const tool = event.target.closest?.("[data-lane-tool]");
  const cell = event.target.closest?.("[data-lane-cell]");
  if (tool) {
    view.dragging = { lane: tool.dataset.laneTool };
  } else if (cell?.draggable) {
    view.dragging = { from: cell.dataset.laneCell };
  } else {
    return;
  }
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "lane"); // some browsers do not start a drag without data
}

export function onDragOver(view, event) {
  const cell = cellOf(event);
  if (!view.dragging || !cell || !view.editor) {
    return;
  }
  const [game, side, index] = cell.dataset.cell.split(":");
  if (!view.editor.games[Number(game)]?.picks[side][Number(index)]) {
    return;
  } // only a hero takes a lane
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  cell.classList.add("drop-ready");
}

export function onDragLeave(event) {
  const cell = cellOf(event);
  if (cell && !cell.contains(event.relatedTarget)) {
    cell.classList.remove("drop-ready");
  }
}

export function onDrop(view, event) {
  const cell = cellOf(event);
  if (!view.dragging || !cell || !view.editor) {
    return;
  }
  event.preventDefault();
  view.readFields();
  const [game, side, index] = cell.dataset.cell.split(":");
  const done =
    view.dragging.from !== undefined
      ? view.moveLane(view.dragging.from, cell.dataset.cell)
      : view.setLane(Number(game), side, Number(index), view.dragging.lane || null);
  view.dragging = null;
  view.armed = null;
  if (done) {
    view.paint();
  }
}

export function onDragEnd(view) {
  view.dragging = null;
  view.root?.querySelectorAll(".drop-ready").forEach(node => node.classList.remove("drop-ready"));
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onDragStart, onDragOver, onDrop, onDragEnd };
