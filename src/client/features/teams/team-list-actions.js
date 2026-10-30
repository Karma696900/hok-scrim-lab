// team list, what happens on a click, a key or a submit: actionsOf.
import { calm } from "../community/stage.js";
import { teamFormHtml } from "./form.js";

export const actionsOf = view => ({
  "open-form": () => {
    if (!view.signedIn()) {
      view.ctx.go(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const slot = view.ctx.root().querySelector("#team-form-slot");
    slot.innerHTML = teamFormHtml();
    slot.hidden = false;
    slot.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    slot.querySelector("input")?.focus({ preventScroll: true });
  },
  "close-form": () => {
    const slot = view.ctx.root().querySelector("#team-form-slot");
    slot.hidden = true;
    slot.innerHTML = "";
  },
  "list-tab": async button => {
    view.scope = button.dataset.tab;
    for (const choice of view.ctx.root().querySelectorAll('[data-team="list-tab"]')) {
      const on = choice === button;
      choice.classList.toggle("on", on);
      choice.setAttribute("aria-pressed", String(on));
    }
    await view.loadGrid();
  },
  "more-teams": () => view.loadGrid({ more: true }),
  "reset-team-filters": async () => {
    view.ctx.root().querySelector("#team-filters").reset();
    await view.loadGrid();
  },
  "filters-toggle": button => {
    const open = button.closest(".cm-filters").classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  },
  accept: async button => view.answer(button, "accept"),
  decline: async button => view.answer(button, "decline")
});
