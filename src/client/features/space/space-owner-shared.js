import { t } from "../../app/browser-i18n.js";

// ---- the page of the owner ---------------------------------------------------------------------------
/** What the share band says first. The same words for everybody: the frame draws it before the data is there. */
export const shareIntro = () =>
  `<p class="muted">${t("Whoever has a link sees what it shares, read only, without an account. A link is the only way your space is shared: nothing of it is listed anywhere.")}</p>`;
