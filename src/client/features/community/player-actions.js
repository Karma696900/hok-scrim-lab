// player, what happens on a click, a key or a submit: actionsOf, formsOf.
import { t } from "../../app/browser-i18n.js";

// ---- what the buttons and forms do ------------------------------------------------------------
export const actionsOf = view => ({
  "edit-profile": () => {
    const slot = view.ctx.root().querySelector("#profile-form-slot");
    slot.innerHTML = view.profileForm(view.current);
    slot.hidden = false;
    slot.scrollIntoView({ block: "nearest" });
    slot.querySelector("textarea")?.focus({ preventScroll: true });
  },
  "close-profile": () => {
    const slot = view.ctx.root().querySelector("#profile-form-slot");
    slot.hidden = true;
    slot.innerHTML = "";
  }
});

export const formsOf = view => ({
  "profile-form": async (form, data) => {
    const text = name => String(data.get(name) ?? "");
    try {
      await view.api("/api/me/player-profile", {
        method: "PUT",
        body: {
          bio: text("bio"),
          lane: text("lane"),
          timezone: text("timezone"),
          languages: data.getAll("languages").map(String),
          mainHeroes: [0, 1, 2].map(index => text(`hero${index}`)).filter(Boolean)
        }
      });
      view.tell(t("Profile saved"));
      await view.show(view.current.tag);
    } catch (problem) {
      form.querySelector("#profile-error").textContent = problem.message;
    }
  },
  "labels-form": async (form, data) => {
    try {
      await view.api(`/api/admin/players/${encodeURIComponent(view.current.tag)}/labels`, {
        method: "PUT",
        body: { labels: data.getAll("labels").map(String) }
      });
      view.tell(t("Labels saved"));
      await view.show(view.current.tag);
    } catch (problem) {
      view.tell(problem.message);
    }
  },
  "invite-player": async (form, data) => {
    try {
      await view.api(
        `/api/teams/${encodeURIComponent(String(data.get("teamId") ?? ""))}/invitations`,
        {
          method: "POST",
          body: { tag: view.current.tag, role: "player", lane: view.current.profile.lane }
        }
      );
      view.tell(t("Invitation sent"));
    } catch (problem) {
      form.parentElement.querySelector("#invite-error").textContent = problem.message;
    }
  }
});
