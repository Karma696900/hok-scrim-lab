// A game in progress: the board laid over the page and the connection to the bots server, where the game
// runs. The server sends the board once, then a frame per tick of only what the player's side sees; the page
// paints the latest at the pace of the screen (the dots glide between two frames, the player's own hero moves at
// once with its stick: simulation-motion.js) and sends the player's inputs (the stick and the targets of
// simulation-controls.js, an answer, a call, the spell, the pause, leaving). The skill pictures are fetched in the background. At the end the grade shows;
// the bots server hands the end of the game to the site, which keeps it for a signed-in player. A watched game
// (mode "watch": ten bots, nobody plays) has its own board, frames and end (simulation-watch.js).
import { api } from "../../app/api-client.js";
import { boardHtml } from "./simulation-board.js";
import { bindCamera, CAMERA_HEIGHTS, unbindCamera } from "./simulation-camera.js";
import { bindControls, unbindControls } from "./simulation-controls.js";
import { bindFullscreen, enterFullscreen, exitFullscreen } from "./simulation-fullscreen.js";
import { placeAt, toggleScoreboard } from "./simulation-hud.js";
import { boardShare } from "./simulation-map.js";
import { moveDots } from "./simulation-motion.js";
import { paintFrame } from "./simulation-paint.js";
import { bindHome, spellArtHtml } from "./simulation-home.js";
import { bindSkills } from "./simulation-skills.js";
import { gradeHtml } from "./simulation-popups.js";
import { bindPresses } from "./simulation-press.js";
import { bindWatch, paintWatch, watchBoardHtml, watchEndHtml } from "./simulation-watch.js";

/** The pictures of the skills of each hero (by the engine's key), from its Camp sheet. */
async function loadIcons(run) {
  const ids = [...new Set(run.start.heroes.map(hero => hero.heroId))];
  await Promise.all(
    ids.map(async id => {
      try {
        const { details } = await api(`/api/heroes/${encodeURIComponent(id)}`);
        const skills = details?.skills ?? [];
        const plain = skills.filter(skill => skill.type === "skill");
        const icons = {};
        plain.forEach((skill, index) => {
          icons[`s${index + 1}`] = skill.icon;
        });
        icons.ult = skills.find(skill => skill.type === "ultimate")?.icon;
        run.icons.set(id, icons);
      } catch {
        // no picture: the dot shows the key of the skill
      }
    })
  );
}

/** The items of the catalogue (name and picture by id), for the scoreboard. */
async function loadItems(run) {
  try {
    const catalog = await api("/api/catalog");
    run.items = new Map(
      (catalog?.items ?? []).map(item => [
        String(item.id),
        { name: item.name, imageId: item.imageId }
      ])
    );
    run.keys.scores = "";
    // the spell's picture from the same catalogue, in place of its glyph
    const art = spellArtHtml(catalog, run.start?.me?.spell);
    const spell = run.layer?.querySelector('[data-sim="spell"]');
    if (art && spell) {
      spell.querySelector("svg")?.remove();
      spell.insertAdjacentHTML("afterbegin", art);
      spell.classList.add("has-art");
    }
  } catch {
    // no catalogue: the scoreboard shows empty item slots with the item's number as their title
  }
}

function bindLayer(run) {
  const { layer } = run;
  const one = selector => layer.querySelector(selector);
  run.layerOf = {
    map: one(".sim-map"),
    dots: one(".sim-dots"),
    death: one(".sim-death"),
    cover: one(".sim-cover"),
    eyes: one(".sim-eyes"),
    clock: one(".sim-clock"),
    farmBlue: one('[data-farm="blue"]'),
    farmRed: one('[data-farm="red"]'),
    farmBar: one(".sim-bar--farm"),
    spell: one('[data-sim="spell"]'),
    spellTime: one(".sim-spell__time"),
    calls: [...layer.querySelectorAll(".sim-call")],
    end: one(".sim-end"),
    game: one(".sim-game"),
    miniEyes: one(".sim-mini-eyes"),
    reach: one("[data-reach]"),
    target: one("[data-target]"),
    miniDots: one(".sim-mini__dots"),
    miniFrame: one(".sim-mini__frame"),
    scoreBlue: one('[data-score="blue"]'),
    scoreRed: one('[data-score="red"]'),
    kda: one("[data-kda]"),
    scores: one(".sim-scores"),
    scoresButton: one('.sim-hud [data-sim="scoreboard"]')
  };
  run.cards = new Map([...layer.querySelectorAll("[data-card]")].map(c => [c.dataset.card, c]));
  run.miniDots = new Map();
  run.miniTowers = new Map(
    [...layer.querySelectorAll("[data-mini-tower]")].map(m => [m.dataset.miniTower, m])
  );
  // the dots of the towers, crystals and camps of a game by hand, each on its point of the map (simulation-stand.js)
  for (const spot of layer.querySelectorAll(".sim-spot[data-at]")) {
    placeAt(spot, spot.dataset.at.split(",").map(Number), run.side);
  }
  run.campMarks = new Map([...layer.querySelectorAll("[data-camp]")].map(m => [m.dataset.camp, m]));
  run.towerMarks = new Map(
    [...layer.querySelectorAll("[data-tower]")].map(m => [m.dataset.tower, m])
  );
}

function endGame(run, result) {
  run.ended = true;
  run.layerOf.game.hidden = true;
  run.layerOf.end.hidden = false;
  run.layerOf.end.innerHTML = run.watch
    ? watchEndHtml(result)
    : gradeHtml(result, { signedIn: run.signedIn });
  run.layerOf.end.querySelector("button")?.focus();
  run.syncFullscreen?.();
  run.onEnd();
}

/** Draws the latest frame the bots server sent, at the pace of the screen. */
function frame(run, now) {
  if (run.stopped) {
    return;
  }
  if (!run.layer.isConnected) {
    run.stop();
    return;
  }
  if (run.latest) {
    (run.watch ? paintWatch : paintFrame)(run, run.latest, run.latest.view, now);
    run.latest = null;
  }
  moveDots(run, now);
  run.handle = requestAnimationFrame(next => frame(run, next));
}

/** The first message: the board is drawn once, then the frames fill it. */
function begin(run, start) {
  run.start = start;
  run.watch = start.mode === "watch";
  // a watched game has no hero of the player; its map keeps the blue base at the bottom
  run.me = run.watch ? { id: null } : start.me;
  run.side = run.watch ? "blue" : start.me.side;
  run.heroIdOf = new Map(start.heroes.map(hero => [hero.id, hero.heroId]));
  run.approximate = new Set(start.heroes.filter(hero => hero.approximate).map(hero => hero.id));
  const board = run.watch ? watchBoardHtml : boardHtml;
  run.layer.innerHTML = board({
    start,
    heroes: run.heroes,
    picture: { image: run.image, debug: run.choice.debug }
  });
  bindLayer(run);
  bindFullscreen(run);
  if (run.watch) {
    bindWatch(run);
  } else {
    bindControls(run);
    bindSkills(run);
    bindHome(run, run.layer);
    bindCamera(run);
    run.layerOf.reach?.style.setProperty(
      "--reach",
      `${boardShare(2 * (start.me.reach ?? 0)).toFixed(2)}%`
    );
    loadItems(run);
  }
  loadIcons(run);
  run.handle = requestAnimationFrame(now => frame(run, now));
}

const MESSAGES = {
  start: begin,
  frame: (run, message) => {
    run.latest = message.state;
    run.camps = message.camps;
    run.newCasts.push(...message.casts);
    if (message.eyes) {
      run.eyes = message.eyes;
    }
  },
  end: (run, message) => {
    run.stop();
    endGame(run, message.result);
  }
};

const send = (run, order) => {
  if (run.socket.readyState === WebSocket.OPEN) {
    run.socket.send(JSON.stringify(order));
  }
};

const ACTIONS = {
  aim: (run, button) => send(run, { type: "target", kind: button.dataset.kind }),
  answer: (run, button) => send(run, { type: "answer", id: button.dataset.id }),
  call: (run, button) => send(run, { type: "call", kind: button.dataset.call }),
  spell: run => send(run, { type: "spell" }),
  recall: run => send(run, { type: "recall" }),
  recover: run => send(run, { type: "recover" }),
  pause: run => send(run, { type: "pause" }),
  scoreboard: run => toggleScoreboard(run),
  speed: (run, button) => send(run, { type: "speed", value: Number(button.dataset.value) }),
  view: (run, button) => send(run, { type: "view", value: button.dataset.value }),
  resume: run => send(run, { type: "resume" }),
  fullscreen: () => enterFullscreen(),
  leave: run => {
    exitFullscreen();
    run.stop();
    run.socket.close(1000, "left");
    run.layer.remove();
    run.onLeave();
  }
};

/**
 * Opens a game over `host`. `game` is what simulation-load.js gives (`{ url, image }`); `choice` the set-up;
 * `onEnd` is called when the game is over (the bots server keeps its end for the player); `onLeave` when the
 * board is closed; `onLost` when the connection drops before the end.
 */
export function startRun({ host, game, choice, heroes, signedIn, onEnd, onLeave, onLost }) {
  const run = {
    choice,
    heroes,
    signedIn,
    image: game.image,
    onEnd,
    onLeave,
    dots: new Map(),
    waves: new Map(),
    campBars: new Map(),
    castUntil: new Map(),
    icons: new Map(),
    keys: { cover: null },
    glide: new Map(),
    camps: {},
    newCasts: [],
    eyes: null,
    latest: null,
    stopped: false,
    ended: false,
    handle: 0
  };
  run.layer = document.createElement("div");
  run.layer.className = "sim-layer";
  // how high the camera is: how many screens wide the field is drawn (simulation-hud.css, simulation-camera.js)
  run.layer.style.setProperty(
    "--sim-zoom",
    String(CAMERA_HEIGHTS[choice.camera] ?? CAMERA_HEIGHTS.normal)
  );
  bindPresses(run.layer, button => ACTIONS[button.dataset.sim]?.(run, button));
  run.stop = () => {
    run.stopped = true;
    cancelAnimationFrame(run.handle);
    unbindControls(run);
    unbindCamera(run);
    run.unbindFullscreen?.();
  };
  run.send = order => !run.stopped && send(run, order);
  run.socket = new WebSocket(game.url);
  run.socket.addEventListener("message", event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    MESSAGES[message.type]?.(run, message);
  });
  run.socket.addEventListener("close", () => {
    if (!run.ended && !run.stopped) {
      exitFullscreen();
      run.stop();
      run.layer.remove();
      onLost();
    }
  });
  host.append(run.layer);
  return run;
}
