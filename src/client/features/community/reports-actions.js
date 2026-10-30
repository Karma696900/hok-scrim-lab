// reports, what happens on a click, a key or a submit: actionsOf.
import { calm } from "./stage.js";

export const actionsOf = view => ({
  "select-report": button => {
    view.selected = button.dataset.id;
    const root = view.ctx.root();
    for (const rowEl of root.querySelectorAll(".rp-row")) {
      const on = rowEl.dataset.id === view.selected;
      rowEl.classList.toggle("on", on);
      rowEl.querySelector(".rp-pick").setAttribute("aria-pressed", String(on));
    }
    const panel = root.querySelector("#report-detail");
    panel.innerHTML = view.detail();
    if (!matchMedia("(min-width: 901px)").matches) {
      panel.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
    }
  },
  "contact-handled": async button => {
    await view.api(`/api/admin/contact/${encodeURIComponent(button.dataset.id)}`, {
      method: "PATCH",
      body: { handled: button.dataset.handled === "1" }
    });
    await view.show();
  },
  "contact-delete": async button => {
    await view.api(`/api/admin/contact/${encodeURIComponent(button.dataset.id)}`, {
      method: "DELETE"
    });
    await view.show();
  },
  "dismiss-report": async button => {
    await view.api(`/api/admin/reports/${encodeURIComponent(button.dataset.id)}`, {
      method: "DELETE"
    });
    view.selected = null;
    await view.show();
  }
});
