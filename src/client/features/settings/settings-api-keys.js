// The API keys of the signed-in person (a section of Settings): make a key, copy it (it is shown once),
// see what each key did last, revoke it. A key only reads; what it can read is chosen when it is made.
// The section is drawn as a small console: the form that makes a key beside the call that uses it, then the
// keys in a list that reads at a glance.
import { t } from "../../app/browser-i18n.js";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as settingsApiKeysParts } from "./settings-api-keys-parts.js";

/**
 * Draws the section into `root` and wires it. `api` and `tell` are the page's; the secret of a new
 * key lives in the page only until it is dismissed. `onCount(live, max)` tells the page how many keys are
 * in use.
 */
export async function mountApiKeys(root, { api, escapeHtml, tell, onCount }) {
  const view = { onCount, root, api, tell };
  bindTo(view, settingsApiKeysParts);
  view.esc = escapeHtml;
  view.data = null;
  view.fresh = null; // { secret, name } of the key that was just made

  view.root.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button || !view.root.contains(button)) {
      return;
    }
    try {
      if ("akCreate" in button.dataset) {
        await view.create();
      } else if ("akCopy" in button.dataset) {
        await navigator.clipboard.writeText(view.fresh.secret);
        view.tell(t("Copied."));
      } else if ("akCopyCurl" in button.dataset) {
        await navigator.clipboard.writeText(
          `curl -H "Authorization: Bearer hok_YOUR_KEY" ${location.origin}/api/v1/heroes`
        );
        view.tell(t("Copied."));
      } else if ("akDismiss" in button.dataset) {
        view.fresh = null;
        view.draw();
      } else if (button.dataset.akRevoke) {
        if (
          confirm(
            t("Revoke the key “{name}”? Programs that use it stop working at once.", {
              name: button.dataset.name
            })
          )
        ) {
          await view.api(`/api/me/api-keys/${encodeURIComponent(button.dataset.akRevoke)}`, {
            method: "DELETE"
          });
          view.tell(t("Key revoked."));
          await view.load();
        }
      } else if (button.dataset.akRemove) {
        await view.api(`/api/me/api-keys/${encodeURIComponent(button.dataset.akRemove)}`, {
          method: "DELETE"
        });
        await view.load();
      }
    } catch (error) {
      view.tell(error.message, "warn");
    }
  });
  // Enter in the name field makes the key; it must not save the settings form around it.
  view.root.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.id === "ak-name") {
      event.preventDefault();
      view.create();
    }
  });

  try {
    await view.load();
  } catch (error) {
    view.root.innerHTML = `<p class="form-error" role="alert">${view.esc(error.message)}</p>`;
  }
}
