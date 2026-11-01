// popular page, what happens on a click, a key or a submit: onClick, onChange.

// ---- events -----------------------------------------------------------------------------------

export async function onClick(view, event) {
  const target = event.target.closest("button");
  if (!target || !view.root.contains(target)) {
    return;
  }
  if (target.dataset.preset) {
    view.ask.preset = target.dataset.preset;
    if (view.ask.preset === "custom") {
      const current = view.data?.period;
      view.ask.from ||= current?.from ?? "";
      view.ask.to ||= current?.to ?? "";
      view.paint();
      return;
    }
    await view.load();
  } else if (target.matches("[data-apply]")) {
    await view.load();
  } else if (target.dataset.rank) {
    view.rank = target.dataset.rank;
    view.paint();
  } else if (target.dataset.lane) {
    view.lane = target.dataset.lane;
    view.paint();
  } else if (target.dataset.scope) {
    view.scope = target.dataset.scope;
    view.paint();
  }
}

export async function onChange(view, event) {
  const { id, value } = event.target;
  if (id === "pop-rule") {
    view.ask.rule = value;
    await view.load();
  } else if (id === "pop-min") {
    view.ask.minGames = Number(value);
    await view.load();
  } else if (id === "pop-duo-lanes") {
    view.duoLanes = value;
    view.paint();
  } else if (id === "pop-from") {
    view.ask.from = value;
  } else if (id === "pop-to") {
    view.ask.to = value;
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange };
