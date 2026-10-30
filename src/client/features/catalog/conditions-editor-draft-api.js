// conditions editor, draft api: nodeFromApi, fromApi, nodeToApi, toApi, and 4 more.
import { PICK_LANES } from "../../../shared/draft-model.js";
import { isChoice } from "../../../shared/stat-values.js";
import { KINDS } from "./conditions-editor-shared.js";

// ---- the draft: what the API holds, with a sign for a number and the text of a number kept as typed --

/** An atom as the editor holds it: "not" on a number is folded into its sign. */
export function nodeFromApi(node) {
  if (Array.isArray(node.of)) {
    return { ...node, negate: Boolean(node.negate), of: node.of.map(nodeFromApi) };
  }
  const draft = { ...node, negate: Boolean(node.negate) };
  if (typeof node.op === "string") {
    if (node.negate) {
      draft.op = node.op === "=" ? "!=" : OPPOSITE[node.op];
    }
    draft.negate = false;
  }
  return draft;
}

/** The conditions of an entry as a draft (null when it has none). */
export const fromApi = when =>
  when?.of?.length ? { match: when.match, of: when.of.map(nodeFromApi) } : null;

export function nodeToApi(node) {
  if (node.kind === "group") {
    return {
      kind: "group",
      match: node.match,
      of: node.of.map(nodeToApi),
      negate: node.negate || undefined
    };
  }
  const body = { ...node };
  delete body.negate;
  if (body.op === "!=") {
    body.op = "=";
    body.negate = true;
  } else if (node.negate) {
    body.negate = true;
  }
  if (body.kind === "stat" && Array.isArray(body.options)) {
    delete body.op;
    delete body.value;
  }
  if (typeof body.value === "string") {
    body.value = Number(body.value);
  }
  return JSON.parse(JSON.stringify(body)); // no undefined left
}

/** The conditions of a draft as the API takes them, or null when there are none. */
export const toApi = when =>
  when?.of?.length ? { match: when.match, of: when.of.map(nodeToApi) } : null;

/** Whether every condition of the draft says what it tests (an empty box is not a condition). */
export function complete(view, node) {
  if (!node) {
    return true;
  }
  switch (node.kind) {
    case "stat": {
      const stat = view.statOf(node.statId);
      if (!stat) {
        return false;
      }
      return isChoice(stat)
        ? (node.options ?? []).length > 0
        : node.value !== "" && node.value !== null && Number.isFinite(Number(node.value));
    }
    case "tag":
      return Number.isInteger(node.tagId);
    case "role":
      return Boolean(node.role);
    case "lane":
      return Boolean(node.lane);
    case "hero":
      return (node.heroIds ?? []).length > 0;
    case "level":
      return Number.isInteger(Number(node.value)) && node.value !== "";
    default:
      return (node.of ?? []).length > 0 && node.of.every(view.complete);
  }
}

export const isComplete = (view, when) => !when || when.of.every(view.complete);

/** A new condition with what is left to choose already chosen, or null when its kind has nothing to test. */
export function blank(view, kind) {
  const catalog = view.getCatalog();
  switch (kind) {
    case "stat": {
      const stat = catalog.stats[0];
      if (!stat) {
        return null;
      }
      return isChoice(stat)
        ? { kind, statId: stat.id, options: [stat.options[0]?.id].filter(Boolean), negate: false }
        : { kind, statId: stat.id, op: ">=", value: "", negate: false };
    }
    case "tag":
      return catalog.tags[0] ? { kind, tagId: catalog.tags[0].id, negate: false } : null;
    case "role":
      return view.roles()[0] ? { kind, role: view.roles()[0], negate: false } : null;
    case "lane":
      return { kind, lane: PICK_LANES[0], negate: false };
    case "hero":
      return view.getHeroes()[0]
        ? { kind, heroIds: [view.getHeroes()[0].id], negate: false }
        : null;
    case "level":
      return { kind, op: ">=", value: 1, negate: false };
    default:
      return { kind: "group", match: "all", negate: false, of: [view.blank("level")] };
  }
}

/** A new condition of the first kind that has something to test. */
export const firstBlank = view => KINDS.map(view.blank).find(Boolean);

// "not at least" is "less than": a comparison that is negated is kept as the opposite one, and "is not"
// for a number is the sign ≠, so a number never needs a "not" of its own
const OPPOSITE = { ">=": "<", "<=": ">", ">": "<=", "<": ">=" };

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { complete, isComplete, blank, firstBlank };
