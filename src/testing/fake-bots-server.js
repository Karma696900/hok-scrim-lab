// A stand-in for the bots server (private repository hok-bots) in the browser check of /simulation: the heroes the
// bots play, and a live game over a WebSocket that speaks the same messages (a start, frames of what the side
// sees, the orders, the end), scripted and short: the stick and the targets are noted, the end comes three seconds of
// play after the first target. At the end it hands the game to the site with the shared secret, as the real server does. A ticket of
// mode "watch" plays a watched game instead: ten bots, the speed and the view switched by orders, nothing handed. The
// WebSocket is written by hand (RFC 6455, unfragmented text frames only): no package for a test.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { FAKE_ART } from "./fake-bots-art.js";
import { watchGame } from "./fake-bots-watch.js";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TICK_MS = 100;
const PLAYED_AFTER_TARGET = 3;
const LANES = ["Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

const BOARS = ["boar", "boarling", "boarling", "boarling"];
/** A map of the same shape as the bots server's (its real map stays private). */
const MAP = {
  bounds: [
    [160, 160],
    [864, 160],
    [864, 864],
    [160, 864]
  ],
  bases: {
    blue: { fountain: [210, 814], crystal: [270, 754] },
    red: { fountain: [814, 210], crystal: [754, 270] }
  },
  lanes: {
    mid: [
      [270, 754],
      [754, 270]
    ]
  },
  river: [],
  walls: [
    [
      [300, 500],
      [340, 500],
      [340, 540]
    ]
  ],
  bushes: [
    [
      [500, 300],
      [540, 300],
      [540, 340]
    ]
  ],
  towers: [
    { id: "blue-mid-1", side: "blue", at: [420, 600] },
    { id: "red-mid-1", side: "red", at: [600, 420] }
  ],
  camps: [
    { id: "blue-red", kind: "red-buff", at: [380, 640] },
    { id: "blue-camp-2", kind: "camp", at: [440, 700], monsters: BOARS }
  ],
  neutral: [{ id: "tyrant", kind: "tyrant", at: [480, 560], monsters: ["tyrant"] }]
};

function textFrame(text) {
  const payload = Buffer.from(text);
  const { length } = payload;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  const head = Buffer.alloc(length < 65_536 ? 4 : 10);
  head[0] = 0x81;
  if (length < 65_536) {
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([head, payload]);
}

/** The whole frames at the start of `buffer` (a browser masks them); `rest` is what is not complete yet. */
function readFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const opcode = buffer[offset] & 15;
    let length = buffer[offset + 1] & 127;
    let at = offset + 2;
    if (length === 126) {
      length = buffer.length >= at + 2 ? buffer.readUInt16BE(at) : Infinity;
      at += 2;
    } else if (length === 127) {
      length = buffer.length >= at + 8 ? Number(buffer.readBigUInt64BE(at)) : Infinity;
      at += 8;
    }
    if (buffer.length < at + 4 + length) {
      break;
    }
    const mask = buffer.subarray(at, at + 4);
    const data = Buffer.from(buffer.subarray(at + 4, at + 4 + length));
    for (let i = 0; i < data.length; i += 1) {
      data[i] ^= mask[i % 4];
    }
    frames.push({ opcode, text: data.toString("utf8") });
    offset = at + 4 + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

/** The ten heroes of the game: the player's slot is the lane they chose, the others in roster order. */
function lineup(ticket, roster) {
  const { side, lane } = ticket.choice;
  const heroes = [];
  let next = 0;
  for (const team of ["blue", "red"]) {
    for (const role of LANES) {
      heroes.push({
        id: `${team}-${LANES.indexOf(role)}`,
        heroId: roster[next % roster.length],
        side: team,
        role
      });
      next += 1;
    }
  }
  return { heroes, me: heroes.find(hero => hero.side === side && hero.role === lane) };
}

// one enemy in the sight of the player's hero (the first of the other side)
function enemyNear(game) {
  const enemy = game.heroes.find(hero => hero.side !== game.side);
  return { ...enemy, pos: [460, 540], alive: true, hp: 400, maxHp: 1000 };
}

// the gauges in place of mana, one of each look: mana, pips (Charlotte at 3), a red bar (Lian Po), none (Arthur),
// a bar turning from yellow to red (Li Xin)
const GAUGES = [
  { kind: "bar", share: 0.75, tone: "mana" },
  { kind: "pips", pips: ["white", "white", "white", "", ""] },
  { kind: "bar", share: 0.6, tone: "red" },
  null,
  { kind: "bar", share: 0.5, tone: "yellow", to: "red", blend: 0.5 }
];

function viewOf(game) {
  const { heroes, side } = game;
  return {
    time: game.time,
    heroes: heroes
      .filter(hero => hero.side === side)
      .map((hero, index) => ({
        ...hero,
        pos: [300 + index * 40, 700 - index * 40],
        alive: true,
        level: 4 + index,
        hp: 2600,
        maxHp: 3400,
        mana: 300,
        maxMana: 400,
        gauge: GAUGES[index % GAUGES.length],
        ult: index === 0,
        cooldowns: { s1: 2 }
      }))
      .concat(game.me ? [enemyNear(game)] : []),
    camps: [...MAP.camps, ...MAP.neutral].map(camp => ({ ...camp, known: true, alive: true })),
    towers: MAP.towers.map(tower => ({ id: tower.id, side: tower.side, alive: true })),
    // a middle-lane wave of 4 minions, its second one hurt, still spawning for a second
    waves: [
      {
        id: "w1",
        side,
        lane: "mid",
        at: [360, 680],
        minions: [
          { kind: "melee", hp: 1 },
          { kind: "melee", hp: 0.5 },
          { kind: "ranged", hp: 1 },
          { kind: "ranged", hp: 1 }
        ],
        spawning: 1
      }
    ],
    scoreboard: heroes.map((hero, index) => ({
      id: hero.id,
      heroId: hero.heroId,
      side: hero.side,
      level: 4,
      kills: index % 3,
      deaths: 1,
      assists: 2,
      items: index === 0 ? ["unknown-item"] : []
    })),
    farm: { blue: 1200, red: 1100 }
  };
}

function stateOf(game) {
  return {
    time: game.time,
    view: viewOf(game),
    target: game.target,
    dead: false,
    respawnAt: 0,
    paused: game.paused,
    question: null,
    hidden: game.paused,
    callIn: 0
  };
}

function finish(game) {
  clearInterval(game.timer);
  const result = { letter: "A", score: 81, paused: game.pausedOnce };
  game.send({ type: "end", result });
  game.socket.end();
  const { side, lane, difficulty } = game.ticket.choice;
  const body = {
    userId: game.ticket.userId,
    game: {
      heroId: game.me.heroId,
      side,
      lane,
      difficulty,
      grade: "A",
      score: 81,
      paused: game.pausedOnce,
      won: true,
      duration: Math.round(game.time)
    }
  };
  fetch(`${game.siteUrl}/api/internal/simulation/games`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bots-secret": game.secret },
    body: JSON.stringify(body)
  }).then(
    answer => game.seen.results.push(answer.status),
    () => game.seen.results.push(0)
  );
}

function tick(game) {
  if (!game.paused) {
    game.time += TICK_MS / 1000;
  }
  game.send({
    type: "frame",
    state: stateOf(game),
    camps: { "blue-red": 0.4 },
    // the AI casts the player's second skill every two seconds (the arc of skills flashes it)
    casts:
      game.me && Math.round(game.time * 10) % 20 === 0 ? [{ hero: game.me.id, key: "s2" }] : [],
    eyes: [{ at: [320, 700], radius: 120 }]
  });
  if (game.targetAt !== null && !game.paused && game.time >= game.targetAt + PLAYED_AFTER_TARGET) {
    finish(game);
  }
}

const TARGETS = { auto: "hero", minion: "wave", tower: "tower" };

const ORDERS = {
  move: (game, order) => game.seen.moves.push([order.x, order.y]),
  target: (game, order) => {
    game.seen.targets.push(order.kind);
    const enemy = enemyNear(game);
    game.target =
      order.kind === "auto" || order.kind === enemy.id
        ? { kind: "hero", id: enemy.id }
        : { kind: TARGETS[order.kind] ?? "hero", id: order.kind === "tower" ? "red-mid-1" : "w1" };
    game.targetAt ??= game.time;
  },
  pause: game => {
    game.paused = true;
    game.pausedOnce = true;
  },
  resume: game => {
    game.paused = false;
  }
};

function listen(game) {
  let pending = Buffer.alloc(0);
  game.socket.on("data", chunk => {
    const { frames, rest } = readFrames(Buffer.concat([pending, chunk]));
    pending = rest;
    for (const { opcode, text } of frames) {
      if (opcode === 8) {
        clearInterval(game.timer);
        game.socket.end();
        return;
      }
      try {
        const order = JSON.parse(text);
        game.seen.orders.push(order.type);
        if (game.orders) {
          game.orders[order.type]?.(order);
        } else {
          ORDERS[order.type]?.(game, order);
        }
      } catch {
        // not JSON: ignored, as the bots server does
      }
    }
  });
  const stop = () => clearInterval(game.timer);
  game.socket.on("close", stop);
  game.socket.on("error", stop);
}

function play(socket, ticket, context) {
  if (ticket.choice?.mode === "watch") {
    watchGame(socket, context, { MAP, TICK_MS, lineup, listen, textFrame, viewOf });
    return;
  }
  const { heroes, me } = lineup(ticket, context.roster);
  const game = {
    ...context,
    socket,
    ticket,
    heroes,
    me,
    side: ticket.choice.side,
    time: 0,
    paused: false,
    pausedOnce: false,
    target: null,
    targetAt: null,
    send: message => socket.writable && socket.write(textFrame(JSON.stringify(message)))
  };
  game.send({
    type: "start",
    map: MAP,
    heroes,
    me: {
      ...me,
      lane: ticket.choice.lane,
      spell: "flash",
      skills: ["s1", "s2", "ult"],
      speed: 60,
      reach: 25,
      sight: 300
    },
    difficulty: ticket.choice.difficulty,
    art: FAKE_ART,
    calls: [
      { id: "regroup", label: "Regroup", icon: "users" },
      { id: "retreat", label: "Retreat", icon: "shield" },
      { id: "objective", label: "Objective", icon: "target" },
      { id: "jungler", label: "Watch the jungler", icon: "eye" }
    ]
  });
  game.timer = setInterval(() => tick(game), TICK_MS);
  listen(game);
}

/**
 * Starts the stand-in: `{ url, seen: { tickets, orders, results, moves, targets }, setSite(url), close() }`. `roster` is the ids of
 * the heroes it plays (the site must know them), `secret` the shared secret; `setSite` gives it the site's address
 * once the site runs (the site needs the stand-in's address first).
 */
export async function startFakeBots({ secret, roster }) {
  const seen = { tickets: [], orders: [], results: [], moves: [], targets: [] };
  const context = { secret, roster, seen, siteUrl: "" };
  const server = createServer((request, response) => {
    if (request.url === "/v1/heroes") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          heroes: roster.map((id, i) => ({ id, name: `Hero ${id}`, lanes: [LANES[i % 5]] }))
        })
      );
      return;
    }
    response.writeHead(404).end();
  });
  server.on("upgrade", (request, socket) => {
    const token = new URL(request.url, "http://bots.test").searchParams.get("ticket") ?? "";
    const ticket = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    seen.tickets.push(ticket);
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}${GUID}`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    play(socket, ticket, context);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    seen,
    setSite: url => {
      context.siteUrl = url;
    },
    close: () => {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    }
  };
}
