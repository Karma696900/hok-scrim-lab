// What the demonstration world is made of: series, tier lists, an agenda, tournaments.
import { DAY, HOUR } from "./demo-data-shared.js";

const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

/** Heroes of the roster that can play a lane, never the same one twice in `taken`. */
function heroesFor(roster, lane, count, taken) {
  const picked = [];
  for (const hero of roster) {
    if (picked.length === count) {
      break;
    }
    if (hero.lanes?.includes(lane) && !taken.has(hero.id)) {
      taken.add(hero.id);
      picked.push(hero.id);
    }
  }
  return picked;
}

async function playSeries(
  store,
  who,
  roster,
  { teamA, teamB, bestOf, gameMode, winsA, winsB, open }
) {
  const created = await who.post("/api/series", { teamA, teamB, bestOf, gameMode });
  const base = `/api/series/${created.id}`;
  // the winner of the series wins the last game: the loser's wins come first, one by one
  const winner = winsA > winsB ? teamA : teamB;
  const loser = winner === teamA ? teamB : teamA;
  let winnerWins = Math.max(winsA, winsB);
  let loserWins = Math.min(winsA, winsB);
  const order = [];
  while (winnerWins > 0 || loserWins > 0) {
    if (loserWins > 0) {
      order.push(loser);
      loserWins -= 1;
    }
    if (winnerWins > 0) {
      order.push(winner);
      winnerWins -= 1;
    }
  }
  const taken = new Set(); // a hero is picked once per team in a Global Ban & Pick series
  const picksOnly = gameMode !== "global-ban-pick";
  const total = picksOnly ? 10 : 20;
  const games = order.length + (open ? 1 : 0);
  for (let index = 0; index < games; index += 1) {
    await who.post(`${base}/game`, { blueTeam: index % 2 === 0 ? teamA : teamB });
    await who.post(`${base}/game/ready`);
    const pool = LANES.flatMap(lane => heroesFor(roster, lane, 4, taken));
    for (const hero of roster) {
      if (pool.length >= total) {
        break;
      }
      if (!taken.has(hero.id)) {
        taken.add(hero.id);
        pool.push(hero.id);
      }
    }
    const last = open && index === games - 1;
    for (let step = 0; step < (last ? 7 : total); step += 1) {
      await who.post(`${base}/game/action`, { heroId: pool[(step * 3 + index * 7) % pool.length] });
    }
    if (last) {
      break;
    }
    // the wait after the last pick ends on the server clock: move it into the past
    await store.pool.query(
      "UPDATE series SET data_json = JSON_SET(data_json, '$.currentGame.draft.deadline', ?) WHERE id = ?",
      [Date.now() - 1, created.id]
    );
    await who.post(`${base}/game/advance`);
    await who.post(`${base}/game/complete`, {
      winner: order[index],
      durationSeconds: 900 + ((index * 337) % 1200)
    });
  }
  return created.id;
}

/** Series that were played (and one still in its draft), the first one shared with the team. */
export async function seedSeries({ store, captain, roster, fox }) {
  const finished = [];
  finished.push(
    await playSeries(store, captain, roster, {
      teamA: "Crimson Fox",
      teamB: "Dawn Owls",
      bestOf: 3,
      gameMode: "global-ban-pick",
      winsA: 2,
      winsB: 1
    })
  );
  finished.push(
    await playSeries(store, captain, roster, {
      teamA: "Crimson Fox",
      teamB: "Jade Dragons",
      bestOf: 3,
      gameMode: "free-for-all",
      winsA: 2,
      winsB: 0
    })
  );
  finished.push(
    await playSeries(store, captain, roster, {
      teamA: "Silver Hawks",
      teamB: "Crimson Fox",
      bestOf: 5,
      gameMode: "free-for-all",
      winsA: 3,
      winsB: 2
    })
  );
  const live = await playSeries(store, captain, roster, {
    teamA: "Crimson Fox",
    teamB: "Tide Hunters",
    bestOf: 3,
    gameMode: "global-ban-pick",
    winsA: 1,
    winsB: 0,
    open: true
  });
  // the first series is shared with the team (the captain leads it)
  await captain.put(`/api/series/${finished[0]}/teams/${fox}`);
  return { finished, live };
}

/** A tier list per lane, filled from the roster. */
export async function seedTierLists({ captain, roster }) {
  const spread = (lane, parts) => {
    const taken = new Set();
    const heroes = heroesFor(roster, lane, 24, taken);
    const labels = ["SS", "S", "A", "B", "C", "D"];
    return {
      tiers: labels.map((label, index) => ({
        id: `t${index}`,
        label,
        heroes: heroes.filter((_, at) => at % labels.length === index).slice(0, parts)
      })),
      unranked: []
    };
  };
  for (const lane of ["Mid Lane", "Jungle", "Roamer"]) {
    await captain.post("/api/tier-lists", {
      name: `${lane} patch review`,
      lane,
      ...spread(lane, 3)
    });
  }
}

/** The agenda of the team and the announcements of two teams that look for a scrim. */
export async function seedAgenda({ captain, as, fox, owls }) {
  const base = Date.now() - (Date.now() % HOUR);
  const events = [
    ["scrim", "Scrim vs Dawn Owls", 1 * DAY + 19 * HOUR, 2 * HOUR, "BO3 Global Ban & Pick, online"],
    ["practice", "Mid lane practice", 2 * DAY + 18 * HOUR, 2 * HOUR, "Draft review first"],
    [
      "vod",
      "VOD review: last scrim",
      3 * DAY + 20 * HOUR,
      90 * 60_000,
      "Everyone watches games 1 and 3"
    ],
    ["meeting", "Team meeting", 5 * DAY + 19 * HOUR, HOUR, "Roster and schedule"],
    [
      "tournament",
      "Open Cup: round of 16",
      6 * DAY + 17 * HOUR,
      3 * HOUR,
      "Check-in 30 minutes before"
    ]
  ];
  for (const [kind, title, startsAt, length, note] of events) {
    await captain.post(`/api/teams/${fox}/events`, {
      kind,
      title,
      startsAt: new Date(base + startsAt).toISOString().slice(0, 16) + ":00Z",
      endsAt: new Date(base + startsAt + length).toISOString().slice(0, 16) + ":00Z",
      note
    });
  }
  await as("rival").post("/api/scrim-posts", {
    teamId: owls,
    startsAt: new Date(base + 2 * DAY + 20 * HOUR).toISOString().slice(0, 16) + ":00Z",
    endsAt: new Date(base + 2 * DAY + 23 * HOUR).toISOString().slice(0, 16) + ":00Z",
    format: 3,
    heroRule: "global-ban-pick",
    control: "online",
    note: "Looking for a semi-pro team, evenings."
  });
  await captain.post("/api/scrim-posts", {
    teamId: fox,
    startsAt: new Date(base + 4 * DAY + 19 * HOUR).toISOString().slice(0, 16) + ":00Z",
    endsAt: new Date(base + 4 * DAY + 22 * HOUR).toISOString().slice(0, 16) + ":00Z",
    format: 5,
    heroRule: "free-for-all",
    control: "online",
    note: "BO5 to test our new jungle."
  });
}

/** Tournament series for the staff pages and the popularity pages. */
export async function seedTournaments({ store, roster, people }) {
  const tournamentTeams = [
    ["Aurora", "Nebula"],
    ["Titan", "Phoenix"],
    ["Lotus", "Vortex"],
    ["Eclipse", "Zenith"]
  ];
  let seed = 3;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [index, [teamA, teamB]] of tournamentTeams.entries()) {
    const games = [];
    const wins = { [teamA]: 0, [teamB]: 0 };
    for (let game = 0; game < 3 && Math.max(...Object.values(wins)) < 2; game += 1) {
      const taken = new Set();
      const blue = game % 2 === 0 ? teamA : teamB;
      const red = game % 2 === 0 ? teamB : teamA;
      const picks = { blue: [], red: [] };
      for (const lane of LANES) {
        picks.blue.push(...heroesFor(roster, lane, 1, taken));
        picks.red.push(...heroesFor(roster, lane, 1, taken));
      }
      const bans = {
        blue: heroesFor(roster, LANES[game % 5], 5, taken),
        red: heroesFor(roster, LANES[(game + 2) % 5], 5, taken)
      };
      const winner = next() > 0.5 ? teamA : teamB;
      wins[winner] += 1;
      games.push({
        gameNumber: game + 1,
        blueTeam: blue,
        redTeam: red,
        winner,
        durationSeconds: 1000 + Math.round(next() * 900),
        bans,
        picks,
        pickLanes: { blue: [...LANES], red: [...LANES] }
      });
    }
    await store.createTournament(
      {
        event: index < 2 ? "Open Cup" : "Global Series",
        stage: ["Round of 16", "Quarter-final", "Semi-final", "Final"][index],
        teamA,
        teamB,
        bestOf: 3,
        rule: "global-ban-pick",
        playedOn: new Date(Date.now() - (index + 1) * 3 * DAY).toISOString().slice(0, 10),
        patch: "1.4",
        sourceUrl: "https://example.test/vod",
        note: "Demo data.",
        games
      },
      people.admin.id
    );
  }
}
