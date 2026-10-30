// What the buttons and the forms of the agenda do.
import { calm } from "./stage.js";
import { dayKey, localInput } from "./community-shared.js";
import { t } from "../../app/browser-i18n.js";
import { addDays } from "./agenda-shared.js";

// ---- what the buttons do ----------------------------------------------------------------------
export const refresh = async page => {
  await Promise.all([page.load(), page.loadUpcoming()]);
  page.paint();
};

export const shift = async (page, direction) => {
  page.cursor =
    page.view === "week"
      ? addDays(page.cursor, 7 * direction)
      : new Date(page.cursor.getFullYear(), page.cursor.getMonth() + direction, 1);
  page.selected = dayKey(page.cursor.getTime());
  await page.load();
  page.paint();
};

/** The date of the form follows the day that is selected (the hours the person typed stay). */
export function followDay(page) {
  const root = page.ctx.root();
  const [year, month, date] = page.selected.split("-").map(Number);
  const day = localInput(new Date(year, month, date).getTime()).slice(0, 10);
  for (const id of ["#ag-start", "#ag-end"]) {
    const field = root.querySelector(id);
    if (field?.value) {
      field.value = `${day}${field.value.slice(10)}`;
    }
  }
}

export const actionsOf = page => ({
  "agenda-view": async button => {
    page.view = button.dataset.mode;
    await page.load();
    page.paint();
  },
  "agenda-prev": () => page.shift(-1),
  "agenda-next": () => page.shift(1),
  "agenda-today": async () => {
    page.cursor = new Date();
    page.selected = dayKey(Date.now());
    await page.load();
    page.paint();
  },
  "agenda-new": () => {
    const form = page.ctx.root().querySelector("#agenda-add");
    if (form) {
      form.open = true;
      form.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
      form.querySelector("select, input")?.focus({ preventScroll: true });
    }
  },
  "select-day": button => {
    page.selected = button.dataset.day;
    page.paint();
    page.followDay();
  },
  "open-event": button => {
    const event = [...page.events, ...page.upcoming].find(item => item.id === button.dataset.id);
    if (event) {
      page.selected = dayKey(event.startsAt);
      page.paint();
      page.followDay();
    }
  },
  rsvp: async button => {
    await page.api(`/api/events/${encodeURIComponent(button.dataset.id)}/rsvp`, {
      method: "POST",
      body: { answer: button.dataset.answer }
    });
    await page.refresh();
  },
  "series-from-event": button => {
    const item = [...page.events, ...page.upcoming].find(entry => entry.id === button.dataset.id);
    if (item) {
      sessionStorage.setItem(
        "hok.prefill",
        JSON.stringify({ teamA: item.team.name, teamB: item.title.replace(/^Scrim vs /, "") })
      );
      page.go("/scrims");
    }
  }
});

export const formsOf = page => ({
  "agenda-event-form": async (form, data) => {
    const error = form.querySelector("#ag-error");
    const startsAt = new Date(String(data.get("start"))).getTime();
    const endsAt = new Date(String(data.get("end"))).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
      error.textContent = t("Choose a start and an end.");
      return;
    }
    try {
      await page.api(`/api/teams/${encodeURIComponent(String(data.get("teamId")))}/events`, {
        method: "POST",
        body: {
          kind: String(data.get("kind")),
          title: String(data.get("title") ?? ""),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          note: String(data.get("note") ?? ""),
          repeatWeeks: Number(data.get("repeatWeeks") ?? 0)
        }
      });
      page.tell(t("Saved"));
      error.textContent = "";
      form.reset();
      await page.refresh();
    } catch (problem) {
      error.textContent = problem.message;
    }
  }
});

/** The team filter of the toolbar. */
export const change = (page, event) => {
  if (event.target.id === "agenda-team") {
    page.teamId = event.target.value;
    page.paint();
  }
};

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { refresh, shift, followDay, change };
