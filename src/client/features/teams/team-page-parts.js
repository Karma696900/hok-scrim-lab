// team page, small helpers: ctxOf, team, address, reload, and 5 more.
import { calm } from "../community/stage.js";
import { menuItems, openMenu } from "../../shell/popover.js";
import { t } from "../../app/browser-i18n.js";

export const ctxOf = page => ({
  api: page.api,
  tell: page.tell,
  go: page.go,
  state: page.state,
  training: page.training,
  root: () => page.root
});

export const team = page => page.root.teamData;

export const address = (page, ...rest) =>
  ["/api/teams", encodeURIComponent(page.team().id), ...rest].join("/");

export const reload = page => page.view.show(page.team().id);

export async function removeMember(page, userId) {
  const leaving = userId === page.state.auth.user?.id;
  if (!confirm(leaving ? t("Leave this team?") : t("Remove this member?"))) {
    return;
  }
  await page.api(page.address("members", encodeURIComponent(userId)), { method: "DELETE" });
  if (leaving) {
    page.go("/teams");
  } else {
    await page.reload();
  }
}

export async function deleteTeam(page) {
  if (!confirm(t("Delete this team and its roster? This cannot be undone."))) {
    return;
  }
  await page.api(page.address(), { method: "DELETE" });
  page.tell(t("Team deleted"));
  page.go("/teams");
}

/** The menu of the stage: the link of the team, leaving it, deleting it. */
export function openTeamMenu(page, button) {
  const role = page.team().myRole;
  const items = [{ id: "copy", icon: "copy", label: t("Copy the team link") }];
  if (role === "owner") {
    items.push("-", { id: "delete", icon: "trash", label: t("Delete the team"), danger: true });
  } else if (role) {
    items.push("-", { id: "leave", icon: "logout", label: t("Leave the team"), danger: true });
  }
  openMenu(button, menuItems(items), {
    label: t("Actions"),
    onPick: async id => {
      try {
        if (id === "copy") {
          await navigator.clipboard.writeText(`${location.origin}${location.pathname}`);
          page.tell(t("Link copied"));
        } else if (id === "leave") {
          await page.removeMember(page.state.auth.user.id);
        } else if (id === "delete") {
          await page.deleteTeam();
        }
      } catch (error) {
        page.tell(error.message);
      }
    }
  });
}

export const closeSlot = (page, id) => {
  const slot = page.root.querySelector(id);
  if (slot) {
    slot.hidden = true;
    slot.innerHTML = "";
  }
};

// What a click on a [data-team] element does on a team's page.
export const teamActionsOf = page => ({
  "open-form": () => {
    page.view.setTab("settings");
    page.root.querySelector("#team-name")?.focus({ preventScroll: true });
  },
  tab: button => page.view.setTab(button.dataset.tab),
  more: button => page.openTeamMenu(button),
  "focus-invite": () => {
    page.view.setTab("roster");
    page.root.querySelector("#invite-form")?.scrollIntoView({
      behavior: calm() ? "auto" : "smooth",
      block: "center"
    });
    page.root.querySelector("#invite-tag")?.focus({ preventScroll: true });
  },
  lane: async button => {
    // One lane per player: a second click on the lane it already is clears it.
    const lane = button.getAttribute("aria-pressed") === "true" ? "" : button.dataset.lane;
    await page.api(page.address("members", encodeURIComponent(button.dataset.user)), {
      method: "PUT",
      body: { role: button.dataset.role, lane }
    });
    await page.reload();
  },
  "new-event": () => page.view.openEventForm(null),
  "new-event-tab": () => {
    page.view.setTab("agenda");
    page.view.openEventForm(null);
  },
  "edit-event": button =>
    page.view.openEventForm(
      page.team().agenda.items.find(item => item.id === button.dataset.id) ?? null
    ),
  "close-event": () => page.closeSlot("#event-form-slot"),
  "delete-event": async button => {
    if (!confirm(t("Delete this event?"))) {
      return;
    }
    await page.api(page.address("events", encodeURIComponent(button.dataset.id)), {
      method: "DELETE"
    });
    await page.reload();
  },
  "remove-logo": async () => {
    await page.api(page.address("logo"), { method: "DELETE" });
    page.tell(t("Logo removed"));
    await page.reload();
  },
  "discord-disconnect": async () => {
    if (!confirm(t("Disconnect this Discord server?"))) {
      return;
    }
    await page.api(page.address("discord"), { method: "DELETE" });
    await page.reload();
  },
  "cancel-invitation": async button => {
    await page.api(page.address("invitations", encodeURIComponent(button.dataset.id)), {
      method: "DELETE"
    });
    await page.reload();
  },
  "goal-edit": button =>
    page.training.edit(
      page.root.querySelector("#goal-form"),
      page.team().training.goals.find(goal => goal.id === button.dataset.id)
    ),
  "goal-cancel": page.reload,
  "hero-goal-delete": async button => {
    if (!confirm(t("Remove this goal?"))) {
      return;
    }
    await page.training.removeHeroGoal(page.team().id, button.dataset.id);
    await page.reload();
  },
  "goal-delete": async button => {
    if (!confirm(t("Remove this goal?"))) {
      return;
    }
    await page.training.remove(page.team().id, button.dataset.id);
    await page.reload();
  },
  "rank-period": button =>
    page.training.chooseRanking(page.root, page.team().id, { period: button.dataset.period }),
  remove: button => page.removeMember(button.dataset.user),
  "delete-team": page.deleteTeam,
  "share-series": async button => {
    await page.api(
      `/api/series/${encodeURIComponent(button.dataset.id)}/teams/${encodeURIComponent(page.team().id)}`,
      { method: "PUT", body: {} }
    );
    page.tell(t("Series shared with the team"));
    await page.reload();
  },
  "unshare-series": async button => {
    await page.api(
      `/api/series/${encodeURIComponent(button.dataset.id)}/teams/${encodeURIComponent(page.team().id)}`,
      { method: "DELETE" }
    );
    page.tell(t("Series removed from the team"));
    await page.reload();
  }
});

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { team, address, reload, removeMember, deleteTeam, openTeamMenu, closeSlot };
