// What the buttons and the forms of the page do.
import { calm } from "./stage.js";
import { t } from "../../app/browser-i18n.js";

// ---- what the buttons and forms do ------------------------------------------------------------
export const closeSlot = (view, id) => {
  const slot = view.ctx.root().querySelector(id);
  slot.hidden = true;
  slot.innerHTML = "";
};

export const actionsOf = view => ({
  "close-composer": () => view.closeSlot("#composer-slot"),
  "request-post": button => {
    const post = view.posts.find(item => item.id === button.dataset.id);
    if (post) {
      view.openComposer(post.team, post);
    }
  },
  "request-team": button => view.openComposer({ id: button.dataset.id, name: button.dataset.name }),
  "open-post-form": () => {
    if (!view.ctx.signedIn()) {
      view.go(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const panel = view.ctx.root().querySelector("#fd-publish");
    panel.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    panel.querySelector("select, a")?.focus({ preventScroll: true });
  },
  "close-post": async button => {
    await view.api(`/api/scrim-posts/${encodeURIComponent(button.dataset.id)}`, {
      method: "DELETE"
    });
    view.tell(t("Announcement closed"));
    await Promise.all([view.loadPosts(), view.loadSide()]);
  },
  "reset-filters": async () => {
    view.ctx.root().querySelector("#find-filters").reset();
    await view.loadPosts();
  },
  "filters-toggle": button => {
    const open = button.closest(".cm-filters").classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  }
});

export const formsOf = view => ({
  "find-filters": () => {}, // the filters search as they change: pressing Enter must not reload the page
  "request-form": async (form, data) => {
    const error = form.querySelector("#rq-error");
    const time = name => new Date(String(data.get(name) ?? "")).getTime();
    if (!Number.isFinite(time("start")) || !Number.isFinite(time("end"))) {
      error.textContent = t("Choose a start and an end.");
      return;
    }
    try {
      const created = await view.api("/api/requests", {
        method: "POST",
        body: {
          fromTeamId: String(data.get("fromTeamId") ?? ""),
          toTeamId: form.dataset.to,
          postId: form.dataset.post || null,
          startsAt: new Date(time("start")).toISOString(),
          endsAt: new Date(time("end")).toISOString(),
          format: Number(data.get("format")),
          heroRule: String(data.get("heroRule") ?? ""),
          control: String(data.get("control") ?? ""),
          note: String(data.get("note") ?? "")
        }
      });
      view.tell(t("Request sent"));
      window.dispatchEvent(new Event("hok:community"));
      view.go(`/inbox?open=${created.id}`);
    } catch (problem) {
      error.textContent = problem.message;
    }
  },
  "post-form": async (form, data) => {
    const error = form.querySelector("#pf-error");
    const time = name => new Date(String(data.get(name) ?? "")).getTime();
    if (!Number.isFinite(time("start")) || !Number.isFinite(time("end"))) {
      error.textContent = t("Choose a start and an end.");
      return;
    }
    try {
      await view.api("/api/scrim-posts", {
        method: "POST",
        body: {
          teamId: String(data.get("teamId") ?? ""),
          startsAt: new Date(time("start")).toISOString(),
          endsAt: new Date(time("end")).toISOString(),
          format: Number(data.get("format")),
          heroRule: String(data.get("heroRule") ?? ""),
          control: String(data.get("control") ?? ""),
          note: String(data.get("note") ?? "")
        }
      });
      view.tell(t("Announcement published"));
      await view.show();
    } catch (problem) {
      error.textContent = problem.message;
    }
  }
});

/** Any change of a filter searches again (there is no button to press). */
export const change = (view, event) => {
  if (event.target.closest("#find-filters")) {
    view.loadPosts().catch(error => view.tell(error.message));
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { closeSlot, change };
