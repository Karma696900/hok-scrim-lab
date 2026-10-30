// The model of a series in the Tournaments page: the rules and the reliability labels, an empty game or series, a series
// as the server returns it turned into the shape the editor works on (and back), clock and bans helpers.
import { icon } from "../../../shared/icons.js";
import { t } from "../../app/browser-i18n.js";
import { LANE_ICON_URLS } from "../../domain/lanes.js";

export const PICKS = 5;
export const GROUPS = [
  ["picks", "blue"],
  ["picks", "red"],
  ["bans", "blue"],
  ["bans", "red"]
];
export const BEST_OF = [1, 3, 5, 7, 9];
/** The five lanes of a team, in the order of the lane logos. */
export const LANES = Object.keys(LANE_ICON_URLS);
/** The names of the draft rules are the names of the game modes: they are not translated. */
export const RULES = [
  ["classic", "Classic"],
  ["free-for-all", "Free For All"],
  ["global-ban-pick", "Global Ban & Pick"]
];
/** How sure a series is: the badge, its look (a pill colour), its icon and what it means. */
export const RELIABILITY = [
  [
    "verified",
    "check",
    "",
    () => t("Verified"),
    () => t("Read from the video and checked by a person.")
  ],
  [
    "video",
    "video",
    "pill--blue",
    () => t("From the video"),
    () => t("Read from the video by the tool: some points are still to check.")
  ],
  [
    "listed",
    "list",
    "pill--warn",
    () => t("Heroes list"),
    () => t("Taken from a results page: heroes, bans and lanes, but not the order of the picks.")
  ]
];
const reliability = value => RELIABILITY.find(([name]) => name === value) ?? RELIABILITY[0];
export const badge = (value, pickOrderKnown = true) => {
  const [, glyph, look, label, meaning] = reliability(value);
  // checked against its source page, but nobody has seen the order of the picks
  const title =
    value === "verified" && pickOrderKnown === false
      ? t(
          "Checked against its source: heroes, bans, lanes and winners hang together. The order of the picks is not known."
        )
      : meaning();
  return `<span class="pill tn-badge ${look}" title="${title}">${icon(glyph, "i--sm")}${label()}</span>`;
};
export const ruleLabel = rule => RULES.find(([value]) => value === rule)?.[1] ?? rule;

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const slots = () => Array.from({ length: PICKS }, () => null);
export const emptyGame = blue => ({
  blue,
  winner: "",
  ultimateBattle: false,
  duration: "",
  picks: { blue: slots(), red: slots() },
  lanes: { blue: slots(), red: slots() },
  bans: { blue: slots(), red: slots() }
});
export const emptySeries = (carry = {}) => ({
  id: null,
  event: carry.event ?? "",
  stage: carry.stage ?? "",
  playedOn: carry.playedOn ?? today(),
  patch: carry.patch ?? "",
  sourceUrl: carry.sourceUrl ?? "",
  note: "",
  verification: "verified",
  pickOrderKnown: true,
  toCheck: [],
  teamA: "",
  teamB: "",
  bestOf: carry.bestOf ?? 3,
  rule: carry.rule ?? "free-for-all",
  games: [emptyGame("A")]
});

const clock = seconds =>
  Number.isInteger(seconds)
    ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : "";
export const seconds = text => {
  const value = String(text).trim();
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{1,3}):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
/** Bans are a list: the filled ones first, so removing one never leaves a hole. */
export const compactBans = game => {
  for (const side of ["blue", "red"]) {
    game.bans[side] = padded(game.bans[side].filter(Boolean));
  }
};
const padded = list => [...list, ...slots()].slice(0, PICKS);

/**
 * A series as the server returns it, in the shape the editor works on (sides as "A" / "B", so
 * renaming a team renames it everywhere).
 */
export function toDraft(series) {
  const token = name => (name === series.teamA ? "A" : "B");
  return {
    id: series.id,
    event: series.event,
    stage: series.stage,
    playedOn: series.playedOn,
    patch: series.patch,
    sourceUrl: series.sourceUrl,
    note: series.note,
    verification: series.verification ?? "verified",
    pickOrderKnown: series.pickOrderKnown !== false,
    toCheck: series.toCheck ?? [],
    teamA: series.teamA,
    teamB: series.teamB,
    bestOf: series.bestOf,
    rule: series.rule ?? "free-for-all",
    games: series.games.map(game => ({
      blue: token(game.blueTeam),
      winner: token(game.winner),
      ultimateBattle: Boolean(game.ultimateBattle),
      duration: clock(game.durationSeconds),
      picks: { blue: padded(game.picks.blue), red: padded(game.picks.red) },
      lanes: { blue: padded(game.pickLanes?.blue ?? []), red: padded(game.pickLanes?.red ?? []) },
      bans: { blue: padded(game.bans.blue), red: padded(game.bans.red) }
    }))
  };
}
