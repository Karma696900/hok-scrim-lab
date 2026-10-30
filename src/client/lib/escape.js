// Text to put inside HTML. Kept apart from dom.js (which needs the document) so that the files that only build HTML
// can use it, and be run without a browser.
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}
