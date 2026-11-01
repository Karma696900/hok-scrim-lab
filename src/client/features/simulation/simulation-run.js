// A game in progress: the board laid over the page and the connection to the bots server, where the game
// runs. The server sends the board once, then a frame per tick of only what the player's side sees; the page
// paints the latest at the pace of the screen and sends the player's inputs (a choice, an answer, a call, the
// spell, the pause, leaving). The skill pictures are fetched in the background. At the end the grade shows;
// the bots server hands the end of the game to the site, which keeps it for a signed-in player.
import { api } from "../../app/api-client.js";
import { boardHtml } from "./simulation-board.js";
import { paintFrame } from "./simulation-paint.js";
import { gradeHtml } from "./simulation-popups.js";

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

function bindLayer(run) {
  const { layer } = run;
  const one = selector => layer.querySelector(selector);
  run.layerOf = {
    map: one(".sim-map"),
    dots: one(".sim-dots"),
    decision: one(".sim-decision"),
    death: one(".sim-death"),
    cover: one(".sim-cover"),
    eyes: one(".sim-eyes"),
    clock: one(".sim-clock"),
    farmBlue: one('[data-farm="blue"]'),
    farmRed: one('[data-farm="red"]'),
    farmBar: one(".sim-bar--farm"),
    meHp: one(".sim-me .sim-bar--hp"),
    spell: one(".sim-spell"),
    spellState: one(".sim-spell__state"),
    calls: [...layer.querySelectorAll(".sim-call")],
    end: one(".sim-end"),
    game: one(".sim-game")
  };
  run.allyRows = new Map([...layer.querySelectorAll("[data-ally]")].map(r => [r.dataset.ally, r]));
  run.skillCells = new Map(
    [...layer.querySelectorAll("[data-skill]")].map(cell => [cell.dataset.skill, cell])
  );
  run.campMarks = new Map([...layer.querySelectorAll("[data-camp]")].map(m => [m.dataset.camp, m]));
  run.towerMarks = new Map(
    [...layer.querySelectorAll("[data-tower]")].map(m => [m.dataset.tower, m])
  );
}

function endGame(run, result) {
  run.ended = true;
  run.layerOf.game.hidden = true;
  run.layerOf.end.hidden = false;
  run.layerOf.end.innerHTML = gradeHtml(result, { signedIn: run.signedIn });
  run.layerOf.end.querySelector("button")?.focus();
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
    paintFrame(run, run.latest, run.latest.view, now);
    run.latest = null;
  }
  run.handle = requestAnimationFrame(next => frame(run, next));
}

/** The first message: the board is drawn once, then the frames fill it. */
function begin(run, start) {
  run.start = start;
  run.me = start.me;
  run.side = start.me.side;
  run.heroIdOf = new Map(start.heroes.map(hero => [hero.id, hero.heroId]));
  run.approximate = new Set(start.heroes.filter(hero => hero.approximate).map(hero => hero.id));
  run.layer.innerHTML = boardHtml({
    start,
    heroes: run.heroes,
    picture: { image: run.image, debug: run.choice.debug }
  });
  bindLayer(run);
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
  choose: (run, button) => send(run, { type: "choose", id: button.dataset.id }),
  answer: (run, button) => send(run, { type: "answer", id: button.dataset.id }),
  call: (run, button) => send(run, { type: "call", kind: button.dataset.call }),
  spell: run => send(run, { type: "spell" }),
  pause: run => send(run, { type: "pause" }),
  resume: run => send(run, { type: "resume" }),
  leave: run => {
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
    keys: { decision: null, cover: null },
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
  run.layer.addEventListener("click", event => {
    const button = event.target.closest("[data-sim]");
    if (button && !button.disabled && ACTIONS[button.dataset.sim]) {
      ACTIONS[button.dataset.sim](run, button);
    }
  });
  run.stop = () => {
    run.stopped = true;
    cancelAnimationFrame(run.handle);
  };
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
      run.stop();
      run.layer.remove();
      onLost();
    }
  });
  host.append(run.layer);
  return run;
}
