// team page, what happens on a click, a key or a submit: onClick, onChange, onInput, formsOf, and 1 more.
import { readTeamForm, updatePreview } from "./form.js";
import { t } from "../../app/browser-i18n.js";

export async function onClick(page, event) {
  const button = event.target.closest("[data-team]");
  if (!button) {
    return;
  }
  const action = button.dataset.team;
  try {
    if (page.mode === "list" && page.list.actions[action]) {
      await page.list.actions[action](button);
    } else if (page.mode === "team") {
      await page.teamActions[action]?.(button);
    }
  } catch (error) {
    page.tell(error.message);
  }
}

export async function onChange(page, event) {
  const target = event.target;
  if (page.mode === "list") {
    if (target.closest("#team-filters")) {
      page.list.loadGrid().catch(error => page.tell(error.message));
    }
    return;
  }
  if (target.id === "rank-exercise") {
    await page.training.chooseRanking(page.root, page.team().id, { exercise: target.value });
    return;
  }
  if (target.id === "rank-visible") {
    try {
      await page.training.showRankingToPlayers(page.team().id, target.checked);
    } catch (error) {
      target.checked = !target.checked;
      page.tell(error.message);
    }
    return;
  }
  if (target.id === "team-logo-file") {
    const file = target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const response = await fetch(page.address("logo"), {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.error || t("Request failed ({status}).", { status: response.status })
        );
      }
      page.tell(t("Logo saved"));
      await page.reload();
    } catch (problem) {
      page.tell(problem.message);
      target.value = "";
    }
    return;
  }
  if (target.dataset?.team !== "role") {
    return;
  }
  const card = target.closest(".pcard");
  try {
    await page.api(page.address("members", encodeURIComponent(target.dataset.user)), {
      method: "PUT",
      body: {
        role: target.value,
        lane: card.querySelector(".lane:not(.off)")?.dataset.lane ?? ""
      }
    });
  } catch (error) {
    page.tell(error.message);
  }
  await page.reload();
}

export function onInput(page, event) {
  if (event.target.id === "team-filter-q") {
    clearTimeout(page.filterTimer);
    page.filterTimer = setTimeout(
      () => page.list.loadGrid().catch(error => page.tell(error.message)),
      250
    );
  } else if (event.target.closest("#team-form")) {
    updatePreview(event.target.closest("#team-form"));
  }
}

/** The forms of a team's page, by id: each gets the form and what it holds. */
export const formsOf = page => ({
  "discord-channel-form": async (form, data) => {
    const channelId = data.get("channelId");
    if (!channelId) {
      return;
    }
    await page.api(page.address("discord", "channel"), {
      method: "PUT",
      body: { channelId: String(channelId) }
    });
    page.tell(t("Channel saved: a message was posted to confirm."));
    await page.reload();
  },
  "event-form": async (form, data) => {
    const error = form.querySelector("#event-error");
    const startsAt = new Date(String(data.get("start"))).getTime();
    const endsAt = new Date(String(data.get("end"))).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
      error.textContent = t("Choose a start and an end.");
      return;
    }
    const body = {
      kind: String(data.get("kind")),
      title: String(data.get("title") ?? ""),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      note: String(data.get("note") ?? ""),
      repeatWeeks: Number(data.get("repeatWeeks") ?? 0)
    };
    try {
      const id = form.dataset.eventId;
      await page.api(id ? page.address("events", encodeURIComponent(id)) : page.address("events"), {
        method: id ? "PUT" : "POST",
        body
      });
      await page.reload();
    } catch (problem) {
      error.textContent = problem.message;
    }
  },
  "team-form": async form => {
    const error = form.querySelector("#team-error");
    try {
      const id = form.dataset.teamId;
      const body = readTeamForm(form);
      if (id) {
        await page.api(`/api/teams/${encodeURIComponent(id)}`, { method: "PUT", body });
        page.tell(t("Team saved"));
        await page.view.show(id);
      } else {
        const created = await page.api("/api/teams", { method: "POST", body });
        page.tell(t("Team created"));
        page.go(`/teams/${created.id}`);
      }
    } catch (problem) {
      error.textContent = problem.message;
    }
  },
  "hero-goal-form": async form => {
    try {
      await page.training.askForHero(form, page.team().id);
      await page.reload();
    } catch (problem) {
      form.querySelector("#hero-goal-error").textContent = problem.message;
    }
  },
  "goal-form": async form => {
    try {
      await page.training.submit(form, page.team().id);
      await page.reload();
    } catch (problem) {
      form.querySelector("#goal-error").textContent = problem.message;
    }
  },
  "invite-form": async (form, data) => {
    const error = form.querySelector("#invite-error");
    try {
      await page.api(page.address("invitations"), {
        method: "POST",
        body: {
          tag: String(data.get("tag") ?? ""),
          role: String(data.get("role") ?? ""),
          lane: String(data.get("lane") ?? "")
        }
      });
      page.tell(t("Invitation sent"));
      await page.reload();
    } catch (problem) {
      error.textContent = problem.message;
    }
  }
});

export async function onSubmit(page, event) {
  const form = event.target;
  if (form.id === "team-filters") {
    event.preventDefault(); // the search field filters as it is typed in
    return;
  }
  // the form that creates a team is on the list; the others belong to the page of a team
  const handler = page.forms[form.id];
  if (!handler || (page.mode === "list" && form.id !== "team-form")) {
    return;
  }
  event.preventDefault();
  try {
    await handler(form, new FormData(form));
  } catch (problem) {
    page.tell(problem.message);
  }
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { onClick, onChange, onInput, onSubmit };
