import { t } from "../../app/browser-i18n.js";
import { api, fetchSeries } from "../../app/api-client.js";
import { tell } from "../../lib/dom.js";
import { render } from "../../app/router.js";
import { state } from "../../app/app-state.js";

async function importSeriesFile(file) {
  try {
    if (file.size > 12 * 1024 * 1024) {
      throw new Error(t("This file is too large (12 MB maximum)."));
    }
    const response = await fetch("/api/series/import-file", {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || t("Import failed ({status}).", { status: response.status }));
    }
    state.view = "scrims";
    state.activeSeriesId = data.imported === 1 ? data.series[0].id : null;
    state.viewGameIndex = null;
    state.series = await fetchSeries();
    if (state.activeSeriesId) {
      const opened = await api(`/api/series/${encodeURIComponent(state.activeSeriesId)}`);
      state.series = [opened, ...state.series.filter(item => item.id !== opened.id)];
    }
    render();
    tell(
      t("{count, plural, one {# series imported} other {# series imported}}", {
        count: data.imported
      }) + (data.comment ? ` · “${data.comment.slice(0, 60)}”` : "")
    );
  } catch (error) {
    tell(error.message);
  }
}

export function createSeriesImportInput() {
  if (document.querySelector("#series-import-file")) {
    return true;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,application/pdf,image/png";
  input.id = "series-import-file";
  input.hidden = true;
  document.body.append(input);
  input.click();
}

/** A series file (PDF or PNG exported by the site) chosen in the file picker. */
export function installScrimsImport() {
  document.addEventListener("change", async event => {
    if (event.target.id !== "series-import-file") {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await importSeriesFile(file);
    event.target.value = "";
  });
}
