// What a game needs before it starts. The game itself runs on the bots server (bots.hok-scrim-lab.com): the
// site gives a ticket for it (60 seconds, used once) with the address to open, and the picture of the board.

/** The ids of the heroes the bots can play, as the bots server lists them (relayed by the site). */
export async function loadPool(api) {
  const { heroes } = await api("/api/simulation/pool");
  return heroes.map(hero => hero.id);
}

/** The last games of the signed-in player. */
export async function loadHistory(api) {
  const { games } = await api("/api/simulation/games");
  return games;
}

/**
 * A game ready to open: `{ url, image }` (`url`: the bots server's socket with its ticket; `image`: the picture of
 * the board, or null). `choice` is `{ side, lane, difficulty, fixed, limit }`, `fixed` the slots chosen by hand
 * (`{ "blue:Jungle": heroId }`, "" or missing: drawn by the bots server).
 */
export async function loadGame(api, choice) {
  const [ticket, board] = await Promise.all([
    api("/api/simulation/ticket", {
      method: "POST",
      body: {
        side: choice.side,
        lane: choice.lane,
        difficulty: choice.difficulty,
        fixed: choice.fixed,
        ...(choice.limit < 3600 ? { limit: choice.limit } : {})
      }
    }),
    // no picture (or a failed answer): the board is drawn from the vector
    api("/api/simulation/map").catch(() => ({ image: null }))
  ]);
  return { url: ticket.url, image: board.image };
}
