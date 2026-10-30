import { COMBO_STEPS_MAX } from "../../../shared/combo-model.js";
import {
  VOD_MARKS_MAX,
  VOD_MARK_TEXT_MAX,
  VOD_SECONDS_MAX,
  clockText,
  vodAddress
} from "../../../shared/vod-model.js";
import { badRequest } from "../../platform/errors.js";
import { cleanText as text, plainObject as object } from "../../platform/validation.js";

// Validation of everything a player or an administrator enters in the training area. Pure: the
// caller says which heroes and maps exist. Nothing about the game is invented here: the kinds of
// pins are generic, the name of a camp, a buff or an objective is typed by the administrator.

export const NOTE_KINDS = ["goal", "mechanic", "combo", "vod"];
const NOTE_STATUSES = ["todo", "practicing", "mastered"];
/** What an administrator can put on the map besides heroes. */
export const PIN_KINDS = ["camp", "buff", "objective", "tower", "bush"];
const PIN_SIDES = ["blue", "red"];
export const FOCUS_MAX = 30;
export const NOTES_MAX = 300;
const HEROES_PER_SIDE_MAX = 5;
const PINS_MAX = 80;
const SKILL_ID = /^[A-Za-z0-9_-]{1,40}$/;
const PIN_ID = /^[a-z0-9]{1,12}$/;

/** A field that is missing, null or an empty list says nothing (a note read back carries them all). */
const given = value =>
  value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length);

const choice = (value, options, label) => {
  if (!options.includes(value)) {
    throw badRequest("{label} must be one of: {options}.", "invalid_body", {
      label,
      options: options.join(", ")
    });
  }
  return value;
};

/** The heroes a player works on, in the order they chose; every one must be a Global hero. */
export function parseFocus(body, knownHeroIds) {
  const input = object(body, "body");
  if (!Array.isArray(input.heroIds) || input.heroIds.length > FOCUS_MAX) {
    throw badRequest("Choose at most {max} heroes.", "invalid_body", { max: FOCUS_MAX });
  }
  const seen = new Set();
  for (const heroId of input.heroIds) {
    if (typeof heroId !== "string" || !knownHeroIds.has(heroId)) {
      throw badRequest("Unknown hero.", "invalid_body");
    }
    if (seen.has(heroId)) {
      throw badRequest("A hero can only be chosen once.", "invalid_body");
    }
    seen.add(heroId);
  }
  return [...seen];
}

/** The moments of a video review: a time in seconds and what to look at, in the order of the video. */
function parseMoments(value) {
  if (!given(value)) {
    return [];
  }
  if (!Array.isArray(value) || value.length > VOD_MARKS_MAX) {
    throw badRequest("A video review has at most {max} moments.", "invalid_body", {
      max: VOD_MARKS_MAX
    });
  }
  return value
    .map((entry, index) => {
      const mark = object(entry, `marks[${index}]`);
      if (!Number.isInteger(mark.at) || mark.at < 0 || mark.at > VOD_SECONDS_MAX) {
        throw badRequest("A moment needs a time between 0:00 and {max}.", "invalid_body", {
          max: clockText(VOD_SECONDS_MAX)
        });
      }
      return {
        at: mark.at,
        text: text(mark.text, `marks[${index}].text`, { max: VOD_MARK_TEXT_MAX, required: true })
      };
    })
    .sort((left, right) => left.at - right.at);
}

/**
 * A line of the notebook: a goal ("what to work on"), a mechanic, a combo, or the review of a video.
 * A combo is a list of steps; a step is one skill of one hero (the picture is read from the hero
 * sheet when it is displayed, so nothing here depends on an image address). A video review is the
 * link of the video and the moments to look at again; it belongs to a hero.
 */
export function parseNote(body, knownHeroIds) {
  const input = object(body, "body");
  const kind = choice(input.kind, NOTE_KINDS, "kind");
  const heroId =
    input.heroId === undefined || input.heroId === null || input.heroId === ""
      ? null
      : input.heroId;
  if (heroId !== null && (typeof heroId !== "string" || !knownHeroIds.has(heroId))) {
    throw badRequest("Unknown hero.", "invalid_body");
  }
  if (kind === "combo" && heroId === null) {
    throw badRequest("A combo belongs to a hero.", "invalid_body");
  }
  const steps = [];
  if (given(input.steps) || (kind === "combo" && Array.isArray(input.steps))) {
    if (kind !== "combo") {
      throw badRequest("Only a combo has steps.", "invalid_body");
    }
    if (!Array.isArray(input.steps) || input.steps.length > COMBO_STEPS_MAX) {
      throw badRequest("A combo has at most {max} steps.", "invalid_body", {
        max: COMBO_STEPS_MAX
      });
    }
    input.steps.forEach((entry, index) => {
      const step = object(entry, `steps[${index}]`);
      if (typeof step.skillId !== "string" || !SKILL_ID.test(step.skillId)) {
        throw badRequest("A step needs a skill.", "invalid_body");
      }
      steps.push({ skillId: step.skillId, hint: text(step.hint, "hint", { max: 60 }) });
    });
  }
  if (kind === "combo" && !steps.length) {
    throw badRequest("A combo needs at least one step.", "invalid_body");
  }
  let url = null;
  let marks = [];
  if (kind === "vod") {
    if (heroId === null) {
      throw badRequest("A video review belongs to a hero.", "invalid_body");
    }
    url = vodAddress(input.url);
    if (!url) {
      throw badRequest("The link of the video must be a full https:// address.", "invalid_body");
    }
    marks = parseMoments(input.marks);
  } else if (given(input.url) || given(input.marks)) {
    throw badRequest("Only a video review has a link and moments.", "invalid_body");
  }
  return {
    kind,
    heroId,
    title: text(input.title, "title", { max: 100, required: true }),
    body: text(input.body, "body", { max: 2000 }),
    status: input.status === undefined ? "todo" : choice(input.status, NOTE_STATUSES, "status"),
    steps,
    url,
    marks
  };
}

const coordinate = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw badRequest("{label} must be a number between 0 and 1.", "invalid_body", { label });
  }
  return Math.round(value * 10_000) / 10_000;
};

/**
 * A situation: a map, a title, a brief and the pins on it. Positions are shares of the map's width
 * and height (0 to 1), so the picture can be shown at any size. A hero pin has a side and may be
 * marked dead; a game pin has a kind and the name the administrator typed.
 */
export function parseScenario(body, { knownHeroIds, knownMapIds }) {
  const input = object(body, "body");
  if (typeof input.mapId !== "string" || !knownMapIds.has(input.mapId)) {
    throw badRequest("Choose one of the uploaded maps.", "invalid_body");
  }
  if (!Array.isArray(input.pins) || input.pins.length > PINS_MAX) {
    throw badRequest("A situation has at most {max} pins.", "invalid_body", { max: PINS_MAX });
  }
  const ids = new Set();
  const perSide = { blue: new Set(), red: new Set() };
  const pins = input.pins.map((entry, index) => {
    const pin = object(entry, `pins[${index}]`);
    const id = typeof pin.id === "string" && PIN_ID.test(pin.id) ? pin.id : null;
    if (!id || ids.has(id)) {
      throw badRequest("Every pin needs its own short id.", "invalid_body");
    }
    ids.add(id);
    const at = {
      x: coordinate(pin.x, `pins[${index}].x`),
      y: coordinate(pin.y, `pins[${index}].y`)
    };
    if (pin.type === "hero") {
      if (typeof pin.heroId !== "string" || !knownHeroIds.has(pin.heroId)) {
        throw badRequest("Unknown hero.", "invalid_body");
      }
      const side = choice(pin.side, PIN_SIDES, `pins[${index}].side`);
      if (perSide[side].has(pin.heroId)) {
        throw badRequest("A hero can only be on the map once per side.", "invalid_body");
      }
      perSide[side].add(pin.heroId);
      if (perSide[side].size > HEROES_PER_SIDE_MAX) {
        throw badRequest("A side has at most {max} heroes.", "invalid_body", {
          max: HEROES_PER_SIDE_MAX
        });
      }
      return { id, type: "hero", heroId: pin.heroId, side, dead: pin.dead === true, ...at };
    }
    const type = choice(pin.type, PIN_KINDS, `pins[${index}].type`);
    const side =
      pin.side === undefined || pin.side === null || pin.side === ""
        ? null
        : choice(pin.side, PIN_SIDES, `pins[${index}].side`);
    return { id, type, label: text(pin.label, `pins[${index}].label`, { max: 40 }), side, ...at };
  });
  return {
    mapId: input.mapId,
    title: text(input.title, "title", { max: 80, required: true }),
    brief: text(input.brief, "brief", { max: 1000 }),
    published: input.published === true,
    pins
  };
}

export function parseAnswer(body) {
  return text(object(body, "body").answer, "answer", { max: 2000, required: true });
}

export function parseMapName(value) {
  return text(typeof value === "string" ? value : "", "name", { max: 80, required: true });
}
