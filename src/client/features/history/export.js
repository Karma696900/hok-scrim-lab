import { t } from "../../app/browser-i18n.js";
import { tell } from "../../lib/dom.js";
import { state } from "../../app/app-state.js";

let exportTarget = null;

export function openExportDialog(target) {
  exportTarget = target;
  const dialog = document.querySelector("#export-dialog");
  const form = dialog.querySelector("form");
  form.reset();
  dialog.querySelector("#export-title").textContent = target.bulk
    ? t("Export your series (PDF)")
    : t("Export this series");
  dialog.querySelector("[data-png-option]").hidden = Boolean(target.bulk);
  dialog.querySelector("#export-filename").value = target.bulk ? "" : target.name || "";
  dialog.querySelector("#export-filename").placeholder = target.bulk
    ? "hok-series"
    : t("File name");
  dialog.querySelector("#export-error").textContent = "";
  dialog.querySelector("#export-count").textContent = "0 / 500";
  dialog.querySelector('button[type="submit"]').disabled = false;
  dialog.showModal();
  dialog.querySelector("#export-comment").focus();
}

async function submitExport(form) {
  const dialog = form.closest("dialog");
  const submit = form.querySelector('button[type="submit"]');
  const error = dialog.querySelector("#export-error");
  const data = new FormData(form);
  const format = target => (target.bulk ? "pdf" : data.get("format"));
  const body = {
    format: format(exportTarget),
    comment: String(data.get("comment") || ""),
    filename: String(data.get("filename") || "")
  };
  if (exportTarget.bulk) {
    Object.assign(
      body,
      Object.fromEntries(Object.entries(state.historyFilters).filter(([, value]) => value))
    );
  }
  submit.disabled = true;
  error.textContent = "";
  submit.textContent = t("Generating…");
  try {
    const response = await fetch(
      exportTarget.bulk
        ? "/api/export/pdf"
        : `/api/series/${encodeURIComponent(exportTarget.seriesId)}/export`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw new Error(
        failure?.error || t("Export failed ({status}).", { status: response.status })
      );
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ||
      `hok-series.${body.format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    dialog.close();
    tell(t("{format} ready · {file}", { format: body.format.toUpperCase(), file: link.download }));
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    submit.disabled = false;
    submit.textContent = t("Download");
  }
}

export function installExportDialog() {
  document.addEventListener("submit", event => {
    if (event.target.id !== "export-form") {
      return;
    }
    event.preventDefault();
    submitExport(event.target);
  });

  document.addEventListener("input", event => {
    if (event.target.id === "export-comment") {
      document.querySelector("#export-count").textContent = `${event.target.value.length} / 500`;
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-export-cancel]")) {
      document.querySelector("#export-dialog").close();
    }
  });
}
