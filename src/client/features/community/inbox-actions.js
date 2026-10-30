// What the buttons and the forms of the inbox do.
import { t } from "../../app/browser-i18n.js";

// ---- what the buttons and forms do ------------------------------------------------------------
/** Draws the page again after an answer, on the same filter and the same conversation. */
export const answered = async view => {
  await view.show();
  window.dispatchEvent(new Event("hok:community"));
};

export const actionsOf = view => ({
  "inbox-team": button => {
    view.teamFilter = button.dataset.id;
    view.drawRail();
    view.drawList();
  },
  "inbox-tab": button => {
    view.tab = button.dataset.tab;
    view.drawRail();
    view.drawList();
  },
  "open-request": button => view.showRequest(button.dataset.id),
  "inbox-back": () => {
    view.selected = null;
    view.ctx.root().querySelector("#ib-app").classList.remove("has-open");
    for (const row of view.ctx.root().querySelectorAll(".th.on")) {
      row.classList.remove("on");
    }
  },
  "read-all": async () => {
    await view.api("/api/notifications/read", { method: "POST", body: {} });
    await view.answered();
  },
  "invite-answer": async button => {
    await view.api(
      `/api/invitations/${encodeURIComponent(button.dataset.id)}/${button.dataset.choice}`,
      { method: "POST" }
    );
    view.tell(
      button.dataset.choice === "accept" ? t("Welcome to the team") : t("Invitation declined")
    );
    await view.answered();
  },
  answer: async button => {
    const id = button.closest("[data-request]").dataset.request;
    await view.api(`/api/requests/${encodeURIComponent(id)}/${button.dataset.action}`, {
      method: "POST"
    });
    await view.answered();
  },
  "toggle-counter": button => {
    const fields = view.ctx.root().querySelector("#counter-fields");
    fields.hidden = !fields.hidden;
    button.setAttribute("aria-expanded", String(!fields.hidden));
  },
  counter: async button => {
    const root = view.ctx.root();
    const id = button.closest("[data-request]").dataset.request;
    const startsAt = new Date(root.querySelector("#counter-start").value).getTime();
    const endsAt = new Date(root.querySelector("#counter-end").value).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
      root.querySelector("#thread-error").textContent = t("Choose a start and an end.");
      return;
    }
    await view.api(`/api/requests/${encodeURIComponent(id)}/counter`, {
      method: "POST",
      body: {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString()
      }
    });
    await view.show();
  },
  report: async () => {
    const reason = prompt(t("Why do you report this conversation?"));
    if (reason) {
      await view.api(`/api/requests/${encodeURIComponent(view.selected)}/report`, {
        method: "POST",
        body: { reason }
      });
      view.tell(t("Thank you: the administrators will look at it."));
    }
  },
  block: async button => {
    if (
      !confirm(
        t(
          "Block this team? It will not be able to send you requests, and you will not be able to send it any."
        )
      )
    ) {
      return;
    }
    await view.api(`/api/teams/${encodeURIComponent(button.dataset.team)}/blocks`, {
      method: "POST",
      body: { teamId: button.dataset.other }
    });
    view.tell(t("Team blocked"));
  }
});

export const formsOf = view => ({
  "message-form": async (form, data) => {
    const message = String(data.get("text") ?? "").trim();
    if (!message) {
      return;
    }
    await view.api(`/api/requests/${encodeURIComponent(view.selected)}/messages`, {
      method: "POST",
      body: { text: message }
    });
    await view.showRequest(view.selected);
  }
});

/** The search field filters the list as it is typed in. */
export const input = (view, event) => {
  if (event.target.id === "inbox-search") {
    view.drawList();
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { answered, input };
