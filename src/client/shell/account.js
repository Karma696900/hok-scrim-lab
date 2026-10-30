import { visitorAccountButtons } from "../../shared/routes.js";
import { icon } from "../../shared/icons.js";
import { api } from "../app/api-client.js";
import { escapeHtml, tell } from "../lib/dom.js";
import { t } from "../app/browser-i18n.js";
import { takeBootstrap } from "../app/stylesheet-loading.js";
import { canRegister, state } from "../app/app-state.js";
import { avatarMarkup } from "../features/auth/auth-avatar.js";
import { menuItems, openMenu } from "./popover.js";

/**
 * The counters of the menu: open announcements, requests waiting for an answer, unread
 * notifications.
 */
async function refreshCommunityBadges() {
  try {
    // the first time, the answer the server wrote into the page (platform/http/bootstrap.js)
    const summary = takeBootstrap("summary") ?? (await api("/api/community/summary"));
    const show = (id, count) => {
      const badge = document.querySelector(`#${id}`);
      if (!badge) {
        return;
      }
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = !count;
    };
    show("badge-find", summary.openPosts);
    show("badge-inbox", summary.awaitingRequests + summary.unreadNotifications);
    show("badge-bell", summary.unreadNotifications);
  } catch {
    /* the menu works without the counters */
  }
}

/** What the signed-in person's chip says under their name: their tag and, for an admin, "Admin". */
const subtitle = user =>
  `${user.tag ? `#${user.tag}` : ""}${user.isAdmin ? `${user.tag ? " · " : ""}${t("Admin")}` : ""}`;

function accountMenuMarkup(user) {
  return `<div class="pop__head">${avatarMarkup(user, 44)}<div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(subtitle(user))}</small></div></div>${menuItems(
    [
      { id: "profile", icon: "user", label: t("Edit my profile") },
      user.tag && {
        id: "player",
        icon: "shieldcheck",
        label: t("Your player page"),
        href: `/players/${encodeURIComponent(user.tag)}`
      },
      { id: "space", icon: "layers", label: t("My space"), href: "/space" },
      { id: "settings", icon: "sliders", label: t("Settings"), href: "/settings" },
      { id: "security", icon: "lock", label: t("Account security"), href: "/account" },
      { id: "discord", icon: "discord", label: t("Discord"), href: "/discord" },
      "-",
      { id: "logout", icon: "logout", label: t("Sign out"), danger: true }
    ].filter(Boolean)
  )}`;
}

export function renderAccountControl() {
  const control = document.querySelector("#account-control");
  if (!control) {
    return;
  }
  const user = state.auth.user;
  for (const id of ["tournaments", "catalog", "reports"]) {
    document.querySelector(`#nav-${id}`).hidden = !user?.isAdmin;
  }
  // the editors (administrators, and the people they gave the Contributor label to) write the guides
  document.querySelector("#nav-guides").hidden = !user?.isEditor;
  document.querySelector("#nav-ratings").hidden = !user?.isEditor;
  for (const id of ["agenda", "inbox", "player", "space"]) {
    document.querySelector(`#nav-${id}`).hidden = !user;
  }
  document.querySelector("#topbar-notifications").hidden = !user;
  if (user?.tag) {
    document.querySelector("#nav-player").href = `/players/${encodeURIComponent(user.tag)}`;
  }
  refreshCommunityBadges();

  if (!user) {
    control.innerHTML = visitorAccountButtons(
      location.pathname + location.search,
      t("Sign in"),
      canRegister() ? t("Create account") : ""
    );
    return;
  }
  control.innerHTML = `<button type="button" class="chip" id="account-trigger" aria-haspopup="menu" aria-expanded="false" title="${escapeHtml(user.email)}">${avatarMarkup(user, 36)}<span><b>${escapeHtml(user.name)}</b><small>${escapeHtml(subtitle(user))}</small></span>${icon("chevron", "i--sm")}</button>`;
}

let profileDialog = null;
let profileModule = null;

async function openProfile() {
  profileModule ??= import("../features/auth/profile.js");
  const module = await profileModule;
  profileDialog ??= module.createProfileDialog({
    state,
    escapeHtml,
    tell,
    onChange: renderAccountControl
  });
  profileDialog.open();
}

async function signOut() {
  try {
    await api("/auth/logout", { method: "POST" });
    location.assign("/");
  } catch (error) {
    tell(error.message);
  }
}

export function installAccount() {
  window.addEventListener("hok:community", refreshCommunityBadges);

  setInterval(() => {
    // not while a reflex exercise runs: it must not be disturbed, even by a request that goes by
    if (document.visibilityState === "visible" && state.auth.user && !state.quiet) {
      refreshCommunityBadges();
    }
  }, 60000);

  document.querySelector("#account-control").addEventListener("click", event => {
    const trigger = event.target.closest("#account-trigger");
    if (!trigger || !state.auth.user) {
      return;
    }
    openMenu(trigger, accountMenuMarkup(state.auth.user), {
      className: "pop--account",
      label: t("Account"),
      onPick: id => {
        if (id === "profile") {
          openProfile();
        } else if (id === "logout") {
          signOut();
        }
      }
    });
  });
}
