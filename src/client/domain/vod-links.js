// The review of a video, as the notebook and a shared space show it: the link of the video with the
// site it is on, then the moments to look at again, each one a link that opens the video at that time
// when the site takes it in its address. The addresses are checked here again before they become a
// link: what is not a fine https:// address stays plain text.
import { icon } from "../../shared/icons.js";
import { clockText, vodHost, vodLink } from "../../shared/vod-model.js";
import { escapeHtml } from "../lib/dom.js";
import { t } from "../app/browser-i18n.js";

const OUTSIDE = `target="_blank" rel="noopener noreferrer nofollow ugc"`;

/** The link of a video review and its moments (`note.url`, `note.marks`); the address alone when it is no link. */
export function vodMarkup(note) {
  const address = vodLink(note.url);
  if (!address) {
    return note.url
      ? `<div class="vod"><span class="muted">${escapeHtml(note.url)}</span></div>`
      : "";
  }
  const marks = (note.marks ?? [])
    .map(mark => {
      const time = clockText(mark.at);
      return `<li><a class="vod-mark" href="${escapeHtml(vodLink(address, mark.at))}" ${OUTSIDE} aria-label="${escapeHtml(t("Watch from {time}", { time }))}">${time}</a><span>${escapeHtml(mark.text)}</span></li>`;
    })
    .join("");
  return `<div class="vod"><a class="btn btn--sm vod-link" href="${escapeHtml(address)}" ${OUTSIDE}>${icon("video", "i--sm")}${t("Watch the video")}<small>${escapeHtml(vodHost(address))}</small></a>${marks ? `<ol class="vod-marks">${marks}</ol>` : ""}</div>`;
}
