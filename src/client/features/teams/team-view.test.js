// The page of a team draws the same HTML before and after a change of how its code is cut into files.
// The tabs shown depend on who looks: a member of the staff, a player, or a visitor.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { fakeRoot, installFakeDom } from "../../../testing/fake-dom.js";
import { expectSnapshot } from "../../../testing/snapshot.js";

const dom = installFakeDom({ pathname: "/teams/team-1" });
const { createTeamView } = await import("./team-view.js");

const at = (day, hour) => Date.UTC(2026, 9, day, hour);
const member = (userId, name, tag, role, lane, labels = []) => ({
  userId,
  name,
  tag,
  role,
  lane,
  labels,
  avatar: null
});
const team = myRole => ({
  id: "team-1",
  name: "Black Tiger Rising",
  tag: "BTR",
  region: "EMEA",
  level: "semi-pro",
  languages: ["en", "fr"],
  timezone: "Europe/Paris",
  description: "We scrim every evening.",
  createdAt: at(1, 9),
  maxMembers: 10,
  myRole,
  members: [
    member("u1", "Alessio", "K7M2QX", "owner", "farm"),
    member("u2", "Mina", "P4N8ZD", "player", "mid"),
    member("u3", "Joao", "R2T6VB", "sub", "mid", ["IGL"]),
    member("u4", "Coach Lea", "C9D3FH", "coach", null)
  ],
  invitations: [{ id: "i1", name: "Tomas", tag: "T5Y7UJ", role: "player" }]
});
const agenda = {
  canSchedule: true,
  items: [
    {
      id: "e1",
      kind: "scrim",
      title: "Scrim vs DMT",
      startsAt: at(26, 18),
      endsAt: at(26, 20),
      note: "BO3"
    },
    { id: "e2", kind: "availability", title: "", startsAt: at(27, 17), endsAt: at(27, 19) },
    { id: "e3", kind: "unavailable", title: "", startsAt: at(28, 17), endsAt: at(28, 19) }
  ]
};
const sharedSeries = {
  total: 1,
  items: [
    {
      id: "s1",
      status: "finished",
      teamA: { name: "Black Tiger Rising" },
      teamB: { name: "DMT" },
      bestOf: 5,
      updatedAt: at(20, 12),
      games: []
    }
  ]
};
const discord = {
  configured: true,
  connected: true,
  guildName: "BTR HQ",
  channelId: "c1",
  channelName: "scrims",
  channels: [
    { id: "c1", name: "scrims" },
    { id: "c2", name: "general" }
  ]
};

/** Draws the page of the team for one viewer and returns the HTML and the view. */
async function draw({ myRole, userId, withDiscord = false, search = "" }) {
  dom.go(search);
  const root = fakeRoot();
  const calls = [];
  const view = createTeamView({
    root: () => root,
    tell: message => calls.push(message),
    state: { auth: { user: userId ? { id: userId } : null } },
    training: { load: async () => null, panel: () => "", fillRanking() {} },
    api: async url => {
      if (url.endsWith("/events")) {
        return agenda;
      }
      if (url.endsWith("/discord")) {
        return withDiscord ? discord : null;
      }
      if (url.includes("/series?pageSize")) {
        return sharedSeries;
      }
      if (url.startsWith("/api/series?view=summary")) {
        return { items: [] };
      }
      return team(myRole);
    }
  });
  await view.show("team-1", { fresh: true });
  return { html: root.innerHTML, view, calls };
}

describe("the page of a team", () => {
  before(() => dom.go(""));

  test("the owner sees every tab, the invitations and the Discord panel", async () => {
    const { html } = await draw({ myRole: "owner", userId: "u1", withDiscord: true });
    for (const tab of ["overview", "roster", "agenda", "series", "discord", "settings"]) {
      assert.match(html, new RegExp(`data-panel="${tab}"`));
    }
    expectSnapshot(import.meta.url, "team-owner", html);
  });

  test("a player sees the team but not the settings or the invitations", async () => {
    const { html } = await draw({ myRole: "player", userId: "u2" });
    assert.doesNotMatch(html, /data-panel="settings"/);
    assert.doesNotMatch(html, /id="invite-form"/);
    expectSnapshot(import.meta.url, "team-player", html);
  });

  test("a visitor sees the public windows only", async () => {
    const { html } = await draw({ myRole: null, userId: null });
    assert.match(html, /data-panel="agenda"/);
    assert.doesNotMatch(html, /data-panel="series"/);
    expectSnapshot(import.meta.url, "team-visitor", html);
  });

  test("the tab asked for by the address opens, and is kept for the next drawing of the same team", async () => {
    const { view } = await draw({ myRole: "owner", userId: "u1", search: "?tab=roster" });
    assert.equal(view.tab(), "roster");
    dom.go("");
    await view.show("team-1");
    assert.equal(view.tab(), "roster", "the tab is kept while the person acts on the same team");
    await view.show("team-1", { fresh: true });
    assert.equal(view.tab(), "overview", "another team starts on the overview");
    assert.equal(view.current().id, "team-1");
  });

  test("the Discord answer of the redirect opens the Discord tab and tells the person", async () => {
    const { view, calls } = await draw({
      myRole: "owner",
      userId: "u1",
      withDiscord: true,
      search: "?discord=added"
    });
    assert.equal(view.tab(), "discord");
    assert.equal(calls.length, 1);
  });
});
