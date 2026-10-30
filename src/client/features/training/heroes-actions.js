// What happens when a person clicks, ticks or types on the page.

export function onClick(view, event) {
  const card = event.target.closest("[data-open]");
  if (card) {
    view.open(card.dataset.open);
    return;
  }
  const practise = event.target.closest("[data-practise]");
  if (practise) {
    view.open(practise.dataset.practise, { scroll: true });
    return;
  }
  const add = event.target.closest("[data-add-hero]");
  if (add) {
    view.save([...view.focus.filter(id => id !== add.dataset.addHero), add.dataset.addHero]);
    return;
  }
  const remove = event.target.closest("[data-untrain]");
  if (remove) {
    view.save(view.focus.filter(id => id !== remove.dataset.untrain));
    return;
  }
  const answer = event.target.closest("[data-answer]");
  if (answer) {
    view.answerReview(answer);
    return;
  }
  const form = event.target.closest("[data-form]");
  if (form) {
    view.toggleForm(form);
    return;
  }
  const lane = event.target.closest("[data-lane]");
  if (lane) {
    view.filter.lane = lane.dataset.lane;
    view.root.querySelector("#focus-lane").innerHTML = view.laneButtons();
    view.root.querySelector("#focus-list").innerHTML = view.pickTiles();
    return;
  }
  const pane = view.root.querySelector("#trn-pick");
  if (event.target.closest("[data-pick-toggle]")) {
    const expanded = !pane.classList.contains("is-open");
    pane.classList.toggle("is-open", expanded);
    event.target.closest("[data-pick-toggle]").setAttribute("aria-expanded", String(expanded));
    return;
  }
  if (event.target.closest("[data-focus-search]")) {
    pane.classList.add("is-open");
    view.root.querySelector("[data-pick-toggle]")?.setAttribute("aria-expanded", "true");
    pane.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest"
    });
    view.root.querySelector("#focus-search")?.focus({ preventScroll: true });
  }
}

export function onChange(view, event) {
  const box = event.target.closest("[data-toggle]");
  if (box) {
    view.save(
      box.checked
        ? [...view.focus, box.dataset.toggle]
        : view.focus.filter(id => id !== box.dataset.toggle)
    );
  }
}

export function onInput(view, event) {
  if (event.target.id !== "focus-search") {
    return;
  }
  view.filter.search = event.target.value;
  view.root.querySelector("#focus-list").innerHTML = view.pickTiles();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange, onInput };
