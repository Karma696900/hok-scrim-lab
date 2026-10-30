import { onAction } from "../../app/event-actions.js";
import { t } from "../../app/browser-i18n.js";
import { api } from "../../app/api-client.js";
import { tell, escapeHtml } from "../../lib/dom.js";
import { icon } from "../../../shared/icons.js";

export function installSharingActions() {
  onAction("share", async button => {
    const path = button.dataset.kind === "series" ? "series" : "tier-lists";
    const invite = await api(`/api/${path}/${encodeURIComponent(button.dataset.id)}/invites`, {
      method: "POST",
      body: { role: button.dataset.role }
    });
    await navigator.clipboard.writeText(`${location.origin}${invite.link}`);
    tell(
      button.dataset.role === "editor"
        ? t("Link copied · single use · can edit · expires in 7 days")
        : t("Link copied · single use · view only · expires in 7 days")
    );
  });
}

/** The buttons that copy the view link, and the edit link when it may be shared, of a resource. */
export function shareButtons(kind, resourceId, allowEdit) {
  const button = (role, label, iconName) =>
    `<button type="button" class="btn btn--sm" data-action="share" data-kind="${kind}" data-id="${escapeHtml(resourceId)}" data-role="${role}">${icon(iconName, "i--sm")}${label}</button>`;
  return `${button("viewer", t("Copy view link"), "link")}${allowEdit ? button("editor", t("Copy edit link"), "pencil") : ""}`;
}
