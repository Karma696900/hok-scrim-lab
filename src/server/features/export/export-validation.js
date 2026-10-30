import { badRequest } from "../../platform/errors.js";

/** Options of a PDF/PNG export: format, a note printed in the file, and the download name. */
export function parseExportOptions(body, { allowPng = true } = {}) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const format = input.format === undefined ? "pdf" : input.format;
  if (!(format === "pdf" || (allowPng && format === "png"))) {
    throw badRequest(
      allowPng ? "format must be pdf or png." : "format must be pdf.",
      "invalid_body"
    );
  }
  let comment = "";
  if (input.comment !== undefined && input.comment !== null) {
    if (typeof input.comment !== "string") {
      throw badRequest("comment must be text.", "invalid_body");
    }
    comment = input.comment
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim();
    if (comment.length > 500) {
      throw badRequest("The comment is limited to 500 characters.", "invalid_body");
    }
  }
  let filename = "";
  if (input.filename !== undefined && input.filename !== null) {
    if (typeof input.filename !== "string" || input.filename.length > 120) {
      throw badRequest("The file name must be text of at most 120 characters.", "invalid_body");
    }
    filename = input.filename.trim();
  }
  return { format, comment, filename };
}
