// The watched game of the stand-in bots server (fake-bots-server.js): ten bots, the speed and the view switched by
// the page's orders, twelve seconds of game (three at x4), the winner at the end; nothing is handed to the site.
// The helpers of the stand-in (its map, framing, line-up, view) come in as arguments, so the two files do not
// import each other.
/** A watched game: every hero in the view "all", only one side's in "blue" or "red". */
export function watchGame(socket, context, { MAP, TICK_MS, lineup, listen, textFrame, viewOf }) {
  const { heroes } = lineup({ choice: { side: "blue", lane: "Mid Lane" } }, context.roster);
  const game = { time: 0, speed: 1, view: "all", follow: null, heroes };
  const send = message => socket.writable && socket.write(textFrame(JSON.stringify(message)));
  const viewOfWatch = () => ({
    ...viewOf({ heroes, side: "blue", time: game.time }),
    side: game.view,
    heroes: heroes
      .filter(hero => game.view === "all" || hero.side === game.view)
      .map((hero, index) => ({
        ...hero,
        pos: [300 + index * 40, 700 - index * 40],
        alive: true,
        hp: 800,
        maxHp: 1000,
        mana: null,
        ult: false
      })),
    scoreboard: heroes.map(hero => ({
      id: hero.id,
      heroId: hero.heroId,
      side: hero.side,
      kills: 1,
      deaths: 0,
      assists: 0,
      items: [],
      level: 4
    }))
  });
  send({
    type: "start",
    mode: "watch",
    map: MAP,
    // with what a hero's point of view needs, as the real bots server sends them
    heroes: heroes.map(hero => ({ ...hero, spell: "flash", reach: 120, speed: 380, sight: 300 })),
    speeds: [0, 1, 2, 4, 8, 16],
    views: ["all", "blue", "red"],
    speed: 1,
    view: "all"
  });
  const timer = setInterval(() => {
    game.time += (TICK_MS / 1000) * game.speed;
    const frame = {
      type: "frame",
      state: { time: game.time, view: viewOfWatch(), speed: game.speed, follow: game.follow },
      camps: {},
      casts: []
    };
    if (game.view !== "all") {
      frame.eyes = [{ at: [320, 700], radius: 120 }];
    }
    send(frame);
    if (game.time >= 12) {
      clearInterval(timer);
      send({
        type: "end",
        result: { winner: "blue", duration: Math.round(game.time), kills: { blue: 7, red: 3 } }
      });
      socket.end();
    }
  }, TICK_MS);
  listen({
    socket,
    seen: context.seen,
    timer,
    orders: {
      speed: order => [0, 1, 2, 4, 8, 16].includes(order.value) && (game.speed = order.value),
      view: order => {
        if (["all", "blue", "red"].includes(order.value)) {
          game.view = order.value;
          game.follow = null;
        }
      },
      // through a hero's eyes: its team's view; null goes back to the whole map
      follow: order => {
        const hero = heroes.find(h => h.id === order.value);
        game.follow = hero ? hero.id : null;
        game.view = hero ? hero.side : "all";
      }
    }
  });
}
