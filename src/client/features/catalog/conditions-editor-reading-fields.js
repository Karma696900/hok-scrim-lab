// conditions editor, reading fields: readNode, readSet, read.
import { isChoice } from "../../../shared/stat-values.js";

// ---- reading the fields back -----------------------------------------------------------------------

export function readNode(view, data, name) {
  const kind = data.get(`${name}-kind`);
  const negate = data.get(`${name}-negate`) === "1";
  switch (kind) {
    case "group":
      return { kind, negate, ...view.readSet(data, name) };
    case "stat": {
      const statId = Number(data.get(`${name}-stat`));
      const stat = view.statOf(statId);
      return isChoice(stat)
        ? { kind, statId, negate, options: data.getAll(`${name}-options`).map(Number) }
        : {
            kind,
            statId,
            negate: false,
            op: String(data.get(`${name}-op`) ?? ">="),
            value: data.get(`${name}-value`) ?? ""
          };
    }
    case "tag":
      return { kind, negate, tagId: Number(data.get(`${name}-tag`)) };
    case "role":
      return { kind, negate, role: String(data.get(`${name}-role`) ?? "") };
    case "lane":
      return { kind, negate, lane: String(data.get(`${name}-lane`) ?? "") };
    case "hero":
      return { kind, negate, heroIds: data.getAll(`${name}-heroes`).map(String) };
    default:
      return {
        kind: "level",
        negate: false,
        op: String(data.get(`${name}-op`) ?? ">="),
        value: data.get(`${name}-value`) ?? ""
      };
  }
}

export function readSet(view, data, name) {
  const of = [];
  for (let index = 0; data.has(`${name}-${index}-kind`); index += 1) {
    of.push(view.readNode(data, `${name}-${index}`));
  }
  return { match: String(data.get(`${name}-match`) ?? "all"), of };
}

/** The conditions of an entry as the form shows them now (null when it has none). */
export function read(view, data, owner) {
  const set = view.readSet(data, `w-${owner}`);
  return set.of.length ? set : null;
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { readNode, readSet, read };
