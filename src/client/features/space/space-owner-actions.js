// space page (owner), what happens on a click, a key or a submit: onSubmit, onClick.
import { t } from "../../app/browser-i18n.js";

export async function onSubmit(page, event) {
  event.preventDefault();
  const form = event.target.closest("#sp-link-form");
  if (!form) {
    return;
  }
  const data = new FormData(form);
  const days = String(data.get("days") ?? "");
  try {
    const { token, link } = await page.view.api("/api/space/links", {
      method: "POST",
      body: {
        sections: data.getAll("sections"),
        label: String(data.get("label") ?? ""),
        days: days ? Number(days) : null
      }
    });
    page.space = { ...page.space, links: [link, ...page.space.links] };
    page.fresh = spaceAddress(token);
    page.paint();
    page.root.querySelector("#sp-fresh-address")?.select();
  } catch (error) {
    form.querySelector("#sp-error").textContent = error.message;
  }
}

export async function onClick(page, event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  try {
    if (button.matches("[data-sp-jump]")) {
      const band = page.root.querySelector("#sp-share");
      band.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
      band.querySelector("input[name=label]")?.focus({ preventScroll: true });
    } else if (button.matches("[data-sp-copy]")) {
      const field = page.root.querySelector("#sp-fresh-address");
      await navigator.clipboard?.writeText(field.value).catch(() => field.select());
      page.view.tell(t("Link copied"));
    } else if (button.dataset.spRemoveLink) {
      if (
        !confirm(t("Remove this link? The people who have it will not see your space any more."))
      ) {
        return;
      }
      await page.view.api(`/api/space/links/${encodeURIComponent(button.dataset.spRemoveLink)}`, {
        method: "DELETE"
      });
      page.space = {
        ...page.space,
        links: page.space.links.filter(link => link.id !== button.dataset.spRemoveLink)
      };
      page.fresh = null;
      page.paint();
      page.view.tell(t("Link removed"));
    } else if (button.dataset.spRemoveBuild) {
      if (!confirm(t("Remove this build from your space?"))) {
        return;
      }
      await page.view.api(`/api/space/builds/${encodeURIComponent(button.dataset.spRemoveBuild)}`, {
        method: "DELETE"
      });
      page.space = {
        ...page.space,
        builds: page.space.builds.filter(item => item.id !== button.dataset.spRemoveBuild)
      };
      page.paint();
      page.view.tell(t("Build removed"));
    }
  } catch (error) {
    page.view.tell(error.message);
  }
}

/** The address that opens a space: the token is after "#", so it never reaches a server or a log. */
const spaceAddress = token => `${location.origin}/space/shared#${token}`;

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onSubmit, onClick };
