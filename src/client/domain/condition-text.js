// What the conditions of an item say, in words: "Attack range is Melee", "Has the tag Marksman",
// "Level is at least 10". The pages show them next to the values and the effects they apply to (see
// shared/condition-model.js for what a condition is). Each phrase is one translatable text with its
// holes, never pieces glued together; the joining words ("and", "or") come from the language.
import { optionOf } from "../../shared/stat-values.js";
import { tx } from "./staff-content.js";
import { list, number, t } from "../app/browser-i18n.js";
import { classLabel, laneName } from "./lanes.js";

// "not at least" is "less than": a negated comparison is written with the opposite one
const OPPOSITE = { ">=": "<", "<=": ">", ">": "<=", "<": ">=" };

/** "{subject} is at least {value}": a number compared with another, the comparison negated or not. */
function comparison(subject, op, value, negate) {
  if (negate && op === "=") {
    return t("{subject} is not {value}", { subject, value });
  }
  switch (negate ? OPPOSITE[op] : op) {
    case ">=":
      return t("{subject} is at least {value}", { subject, value });
    case "<=":
      return t("{subject} is at most {value}", { subject, value });
    case ">":
      return t("{subject} is more than {value}", { subject, value });
    case "<":
      return t("{subject} is less than {value}", { subject, value });
    default:
      return t("{subject} is {value}", { subject, value });
  }
}

/**
 * The words of one condition, or of a set of them. `index` is `indexCatalog(catalog)` and `heroName`
 * turns the id of a hero into its name. A set inside a set is put in brackets.
 */
function phrase(condition, { index, heroName }) {
  const not = Boolean(condition.negate);
  if (Array.isArray(condition.of)) {
    const inner = list(
      condition.of.map(part => phrase(part, { index, heroName })),
      condition.match === "any" ? "disjunction" : "conjunction"
    );
    return not ? t("not ({conditions})", { conditions: inner }) : `(${inner})`;
  }
  switch (condition.kind) {
    case "stat": {
      const stat = index.stats.get(condition.statId);
      const name = tx(stat?.name ?? "?");
      if (Array.isArray(condition.options)) {
        const options = list(
          condition.options.map(id => tx(optionOf(stat, id)?.name ?? "?")),
          "disjunction"
        );
        return not
          ? t("{stat} is not {options}", { stat: name, options })
          : t("{stat} is {options}", { stat: name, options });
      }
      return comparison(name, condition.op, number(condition.value), not);
    }
    case "tag": {
      const tag = tx(index.tags.get(condition.tagId)?.name ?? "?");
      return not ? t("Does not have the tag {tag}", { tag }) : t("Has the tag {tag}", { tag });
    }
    case "role": {
      const role = classLabel(condition.role);
      return not ? t("Class is not {role}", { role }) : t("Class is {role}", { role });
    }
    case "lane": {
      const lane = laneName(condition.lane);
      return not ? t("Does not play {lane}", { lane }) : t("Plays {lane}", { lane });
    }
    case "hero": {
      const heroes = list(condition.heroIds.map(heroName), "disjunction");
      return not ? t("Hero is not {heroes}", { heroes }) : t("Hero is {heroes}", { heroes });
    }
    default:
      return comparison(t("Level"), condition.op, number(condition.value), not);
  }
}

/** The conditions of a value or an effect as one sentence ("A and B"), or "" when there are none. */
function describeWhen(when, context) {
  if (!when?.of?.length) {
    return "";
  }
  return list(
    when.of.map(part => phrase(part, context)),
    when.match === "any" ? "disjunction" : "conjunction"
  );
}

/** What the page prints under a value or an effect that depends on conditions: "When: …". */
export const whenText = (when, context) => {
  const sentence = describeWhen(when, context);
  return sentence ? t("When: {conditions}", { conditions: sentence }) : "";
};

/** "Temporary" or "Temporary, 3 s": the mark of a value that does not last. */
export const temporaryText = line =>
  line.durationSeconds
    ? t("Temporary, {seconds} s", { seconds: number(line.durationSeconds) })
    : t("Temporary");
