// profile, small helpers: sendJson, apply, paint, build.
import { avatarMarkup } from "./auth-avatar.js";
import { escapeHtml } from "../../lib/escape.js";
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";

export const sendJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || t("Request failed ({status}).", { status: response.status }));
  }
  return data;
};

export function apply(view, profile) {
  Object.assign(view.state.auth.user, {
    name: profile.name,
    tag: profile.tag,
    picture: profile.picture,
    avatarKind: profile.avatarKind,
    hasGooglePhoto: profile.hasGooglePhoto
  });
  view.onChange();
  view.paint();
}

export function paint(view) {
  const user = view.state.auth.user;
  view.dialog.innerHTML = `<div class="dialog__head">
        <div class="pdlg__who">${avatarMarkup(user, 72)}<div><h2 id="profile-title">${escapeHtml(user.name)}</h2><p><code>#${escapeHtml(user.tag || "")}</code> <button type="button" class="link" data-profile="copy-tag">${t("Copy tag")}</button></p></div></div>
        <button type="button" class="btn btn--ghost btn--icon btn--sm" data-profile="close" aria-label="${t("Close")}">${icon("x", "i--sm")}</button>
      </div>
      <section class="pdlg__section" aria-labelledby="profile-photo-title">
        <h3 id="profile-photo-title">${t("Profile photo")}</h3>
        <div class="hstack wrap">
          <button type="button" class="btn btn--sm" data-profile="upload">${icon("upload", "i--sm")}${t("Upload a photo")}</button>
          ${user.hasGooglePhoto && user.avatarKind !== "google" ? `<button type="button" class="btn btn--sm" data-profile="google">${icon("google", "i--sm")}${t("Use my Google photo")}</button>` : ""}
          ${user.avatarKind !== "none" ? `<button type="button" class="btn btn--sm btn--ghost" data-profile="remove">${t("Remove the photo")}</button>` : ""}
          <input type="file" id="profile-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
        <p class="muted">${t("PNG, JPEG, WebP or GIF, 4 MB maximum. It is cropped to a square.")}</p>
      </section>
      <form class="pdlg__form" data-profile-form novalidate>
        <label class="label" for="profile-name">${t("Pseudo")}<span class="field"><input id="profile-name" name="name" maxlength="60" autocomplete="nickname" required value="${escapeHtml(user.name)}"></span></label>
        <p class="form-error" id="profile-error" role="alert"></p>
        <div class="dialog__foot"><a class="btn btn--ghost" href="/account" data-profile="account">${icon("lock")}${t("Account security")}</a><button class="btn btn--primary" type="submit">${icon("check")}${t("Save pseudo")}</button></div>
      </form>`;
}

export function build(view) {
  view.dialog = document.createElement("dialog");
  view.dialog.className = "dialog";
  view.dialog.setAttribute("aria-labelledby", "profile-title");
  document.body.append(view.dialog);
  view.dialog.addEventListener("click", async event => {
    if (event.target === view.dialog) {
      return view.dialog.close();
    }
    const action = event.target.closest("[data-profile]")?.dataset.profile;
    if (!action) {
      return;
    }
    const error = view.dialog.querySelector("#profile-error");
    try {
      if (action === "close") {
        view.dialog.close();
      } else if (action === "account") {
        view.dialog.close();
      } // the link navigates (handled by the app's link handler)
      else if (action === "copy-tag") {
        await navigator.clipboard.writeText(`#${view.state.auth.user.tag}`);
        view.tell(t("Tag copied"));
      } else if (action === "upload") {
        view.dialog.querySelector("#profile-file").click();
      } else if (action === "google") {
        view.apply(
          await sendJson("/api/profile/avatar", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "google" })
          })
        );
      } else if (action === "remove") {
        view.apply(
          await sendJson("/api/profile/avatar", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "none" })
          })
        );
      }
    } catch (problem) {
      if (error) {
        error.textContent = problem.message;
      } else {
        view.tell(problem.message);
      }
    }
  });
  view.dialog.addEventListener("change", async event => {
    if (event.target.id !== "profile-file") {
      return;
    }
    const file = event.target.files?.[0];
    const error = view.dialog.querySelector("#profile-error");
    if (!file) {
      return;
    }
    if (!TYPES.has(file.type)) {
      error.textContent = t("Choose a PNG, JPEG, WebP or GIF picture.");
      return;
    }
    if (file.size > MAX_BYTES) {
      error.textContent = t("This picture is too large (4 MB maximum).");
      return;
    }
    try {
      view.apply(
        await sendJson("/api/profile/avatar", {
          method: "POST",
          headers: { "content-type": file.type },
          body: file
        })
      );
      view.tell(t("Profile updated"));
    } catch (problem) {
      error.textContent = problem.message;
    }
  });
  view.dialog.addEventListener("submit", async event => {
    const form = event.target.closest("[data-profile-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const error = view.dialog.querySelector("#profile-error");
    error.textContent = "";
    try {
      view.apply(
        await sendJson("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: new FormData(form).get("name") })
        })
      );
      view.tell(t("Profile updated"));
    } catch (problem) {
      error.textContent = problem.message;
    }
  });
}

const MAX_BYTES = 4 * 1024 * 1024;

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { apply, paint, build };
