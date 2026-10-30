// The statistics blocks of a hero sheet: avatars instead of names, big figures, rings and small bars
// instead of tables. Charts are inline SVG drawn with attributes and classes only (the CSP forbids
// style attributes).
import { tx } from "../../domain/staff-content.js";
import { number, percentage, t } from "../../app/browser-i18n.js";
import { state } from "../../app/app-state.js";
import { PAIRING_MIN_GAMES } from "../../../shared/pairing.js";
import { MAX_LEVEL, indexCatalog, statAtLevel } from "../../../shared/build-model.js";
import { isChoice, optionOf } from "../../../shared/stat-values.js";
import { tagChip } from "../build-lab/build-lab-view.js";
import { avatar, bar, donut, figure, heroName, windowPicker } from "./hero-stats-pieces.js";
export { readWindow } from "./hero-stats-window.js";
export { saveWindow } from "./hero-stats-window.js";
export { sinceOf } from "./hero-stats-window.js";
export { windowLabel } from "./hero-stats-window.js";
export { avatar } from "./hero-stats-pieces.js";
export { donut } from "./hero-stats-pieces.js";
export { bar } from "./hero-stats-pieces.js";
export { figure } from "./hero-stats-pieces.js";
export { headlineFigures } from "./hero-stats-pieces.js";

/**
 * Below this many games for the hero the numbers are shown with a "small sample" note (the counts
 * are always shown).
 */
export const SMALL_SAMPLE = 10;

const RULES = () => [
  ["classic", t("Classic")],
  ["free-for-all", t("Free for All")],
  ["global-ban-pick", t("Global Ban & Pick")]
];

// ---- sections -----------------------------------------------------------------------------------

/**
 * Competitive statistics: from the real series entered on the Tournaments page, for the chosen
 * period.
 */
export function tournamentSection(sheet, { dataUnavailable, window }) {
  const stats = sheet.tournament;
  const range = stats.range.first
    ? t("Games entered from {first} to {last}.", {
        first: stats.range.first,
        last: stats.range.last
      })
    : "";

  const picker = windowPicker(window, range);

  if (!stats.totalGames) {
    return `${picker}${dataUnavailable(stats.range.first ? t("No tournament game falls in this period.") : t("No tournament has been entered yet."))}`;
  }

  const small = entry =>
    entry.picks < SMALL_SAMPLE
      ? `<p class="insufficient">${t("Small sample: {picks, plural, one {# game} other {# games}} with this hero. Read the percentages with care.", { picks: entry.picks })}</p>`
      : "";

  const side = (label, entry, tone) =>
    bar(label, entry.winRate, {
      tone,
      detail: entry.picks
        ? t("{wins}/{picks}", {
            wins: entry.wins,
            picks: entry.picks
          })
        : ""
    });

  const renderStats = (entry, title = "") => `
    ${title ? `<h3>${title}</h3>` : ""}
    <div class="stat-visuals">
      <div class="stat-ring">
        ${entry.picks ? donut(entry.wins, entry.losses) : `<p class="muted">${t("Never picked in this period.")}</p>`}
        <p class="muted">
          ${t(
            "{picks, plural, one {# pick} other {# picks}} in {total, plural, one {# game} other {# games}}",
            {
              picks: entry.picks,
              total: entry.totalGames
            }
          )}
        </p>
      </div>
      <div class="stat-main">
        <div class="stat-figures">
          ${figure(t("Pick rate"), entry.pickRate, { detail: `${entry.picks}` })}
          ${figure(t("Ban rate"), entry.banRate, { tone: "warn", detail: `${entry.bans}` })}
          ${figure(t("Presence (picked or banned)"), entry.presence, { tone: "violet" })}
        </div>
        <div class="stat-bars">
          ${side(t("Win rate on blue side"), entry.side.blue, "blue")}
          ${side(t("Win rate on red side"), entry.side.red, "red")}
        </div>
      </div>
    </div>
    ${small(entry)}
  `;

  return `
    ${picker}

    <section class="tournament-global">
      <h3>${t("All rules")}</h3>
      ${renderStats(stats)}
    </section>

    <div class="tournament-rule-stats">
      ${RULES()
        .map(([rule, label]) => {
          const entry = stats.byRule?.[rule];

          if (!entry) {
            return "";
          }

          // a rule nobody played in this period is one quiet line, not a block of zeros
          if (!entry.totalGames) {
            return `
            <section class="tournament-rule-card is-quiet">
              <h3>${label}</h3>
              <p class="muted">${t("No game was entered under this rule in this period.")}</p>
            </section>
          `;
          }

          return `
            <section class="tournament-rule-card">
              ${renderStats(entry, label)}
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

/**
 * Pairings of one entry: the three heroes it wins best with and against, then the three it loses most with and against,
 * as avatars with the record. A hero is in one row only (the server places the wins first, the losses take the next hero).
 */
function pairingRows(entry, { escapeHtml, heroOf }, size, { named = false } = {}) {
  const one = item => {
    const hero = heroOf(item.heroId);
    return `<div class="pairing-hero">${avatar(hero, { escapeHtml, size })}${named ? `<small>${escapeHtml(heroName(hero))}</small>` : ""}<small class="pairing-record">${percentage(item.count / item.games, 0)} · ${item.count}/${item.games}</small></div>`;
  };
  const row = (title, entries) =>
    entries?.length
      ? `<div class="pairing-row">
      <h3>${title}</h3>
      <div class="pairing-avatars">${entries.map(one).join("")}</div>
    </div>`
      : "";
  const rows =
    row(t("Wins best with"), entry.bestAllies) +
    row(t("Wins best against"), entry.bestEnemies) +
    row(t("Loses most with"), entry.worstAllies) +
    row(t("Loses most against"), entry.worstEnemies);
  return rows
    ? `<div class="pairings">${rows}</div>`
    : `<p class="muted">${t("No hero has been met in {count} games yet: nothing to rank.", { count: PAIRING_MIN_GAMES })}</p>`;
}

/** Pairings: the three allies and the three opponents most often seen with this one in the games it won, as avatars. */
export function pairingsSection(sheet, context) {
  const { dataUnavailable } = context;
  const stats = sheet.tournament;
  // not a single game played under any rule: one line, not a block per rule
  if (!hasPairings(stats)) {
    return dataUnavailable(
      stats.totalGames
        ? t("This hero was not played in this period.")
        : t("No tournament has been entered yet.")
    );
  }

  const renderPairings = (entry, title = "") => {
    if (!entry.wins && !entry.losses) {
      const reason = entry.totalGames
        ? t("This hero was not played in this period.")
        : title
          ? t("No game was entered under this rule in this period.")
          : t("No tournament has been entered yet.");
      return `
        <section class="tournament-rule-card is-quiet">
          ${title ? `<h3>${title}</h3>` : ""}
          ${title ? `<p class="muted">${reason}</p>` : dataUnavailable(reason)}
        </section>
      `;
    }

    return `
      <section class="tournament-rule-card">
        ${title ? `<h3>${title}</h3>` : ""}
        ${pairingRows(entry, context, 64)}
      </section>
    `;
  };

  const rules = RULES()
    .map(([rule, label]) => [stats.byRule?.[rule], label])
    .filter(([entry]) => entry);
  const played = rules.filter(([entry]) => entry.wins || entry.losses);
  const quiet = rules.filter(([entry]) => !entry.wins && !entry.losses);
  return `<div class="pairings-grid">
    <section class="tournament-global">
      <h3>${t("All rules")}</h3>
      ${renderPairings(stats)}
    </section>

    <div class="tournament-rule-stats">${played.map(([entry, label]) => renderPairings(entry, label)).join("")}</div>
    <div class="tournament-rule-stats tournament-rule-stats--quiet">${quiet.map(([entry, label]) => renderPairings(entry, label)).join("")}</div>
    <p class="muted pairings-note">${t("Ranked by reliable win rate over the games played together; a hero needs at least {count} of them.", { count: PAIRING_MIN_GAMES })}</p></div>
  `;
}

/** Whether any rule has a game this hero was picked in (won or lost): without one there is nothing to pair. */
export const hasPairings = stats =>
  Boolean(stats?.wins || stats?.losses) ||
  RULES().some(([rule]) => stats?.byRule?.[rule]?.wins || stats?.byRule?.[rule]?.losses);

/** The pairings of the overview: every rule together, in big avatars; "" when the hero was never picked. */
export function pairingsDigest(sheet, context) {
  const stats = sheet.tournament;
  return stats?.wins || stats?.losses ? pairingRows(stats, context, 84, { named: true }) : "";
}

/** "Your scrims": the viewer's own games, as a ring, bars and avatar rows. */
export function scrimsSection(scrims, { escapeHtml, dataUnavailable, heroOf }) {
  if (!scrims || !scrims.totalGames) {
    return dataUnavailable(
      t("No recorded games in your scrims yet. Results appear here once you save games.")
    );
  }
  const note = scrims.insufficient
    ? `<p class="insufficient">${t("Insufficient sample ({picked}/{minGames} games picked)", { picked: scrims.picked, minGames: scrims.minGames })}</p>`
    : "";
  const pairs = (title, rows) =>
    rows.length
      ? `<div class="pair-column"><h3>${title}</h3><ul class="pair-list">${rows.map(row => `<li>${avatar(heroOf(row.heroId), { escapeHtml, size: 40 })}<div class="pair-meter">${bar(t("{wins}-{losses}", { wins: row.wins, losses: row.games - row.wins }), row.insufficient ? null : row.winRate)}</div></li>`).join("")}</ul></div>`
      : `<div class="pair-column"><h3>${title}</h3><p class="muted">${t("No recorded games.")}</p></div>`;
  return `<div class="stat-visuals">
    <div class="stat-ring">${scrims.picked ? donut(scrims.wins, scrims.losses) : `<p class="muted">${t("Never picked in your scrims.")}</p>`}<p class="muted">${t("{picks, plural, one {# pick} other {# picks}} in {total, plural, one {# game} other {# games}}", { picks: scrims.picked, total: scrims.totalGames })}</p></div>
    <div class="stat-bars">${bar(t("Pick rate"), scrims.pickRate, { detail: `${scrims.picked}` })}${bar(t("Ban rate"), scrims.totalGames ? scrims.banned / scrims.totalGames : null, { tone: "warn", detail: `${scrims.banned}` })}</div></div>${note}
    <div class="pair-grid">${pairs(t("Synergies (teammates)"), scrims.synergies)}${pairs(t("Matchups (opponents)"), scrims.matchups)}</div>
    <p class="muted">${t("Percentages appear from {minGames} games. Only your own recorded scrims are used.", { minGames: scrims.minGames })}</p>`;
}

/** The value of a stat as it is written: a number, and a % when the stat is a percentage. */
const shownStat = (stat, value) =>
  `${number(Number(value.toFixed(2)))}${stat.unit === "percent" ? "%" : ""}`;

/** Rewrites the "at level N" column of the base stats (the slider of the sheet moves it). */
export function showLevel(root, level) {
  const sheet = state.heroSheet;
  if (!sheet?.profile) {
    return;
  }
  const index = indexCatalog(state.catalog ?? { stats: [], tags: [], items: [], arcana: [] });
  for (const cell of root.querySelectorAll("[data-level-stat]")) {
    const entry = sheet.profile.baseStats.find(
      item => String(item.statId) === cell.dataset.levelStat
    );
    const stat = index.stats.get(Number(cell.dataset.levelStat));
    if (entry && stat) {
      cell.textContent = shownStat(stat, statAtLevel(entry, level));
    }
  }
  for (const label of root.querySelectorAll("[data-level-label]")) {
    label.textContent = t("At level {level}", { level });
  }
  const output = root.querySelector("[data-level-output]");
  if (output) {
    output.textContent = t("Level {level}", { level });
  }
}

/**
 * The hero's real base stats (value at level 1 and at the last level, and at the level the slider
 * is on) and its tags. Written by an administrator; nothing is guessed.
 */
export function profileStatsSection(sheet, { escapeHtml, dataUnavailable, catalog, isAdmin }) {
  const profile = sheet.profile;
  const index = indexCatalog(catalog ?? { stats: [], tags: [], items: [], arcana: [] });
  const edit = isAdmin
    ? `<div class="hstack wrap hero-edit"><button type="button" class="btn btn--sm" data-action="edit-hero-data">${t("Edit hero data")}</button></div>`
    : "";
  const tags = (profile.tags ?? [])
    .map(id => index.tags.get(id))
    .filter(Boolean)
    .map(tag => tagChip(tag, escapeHtml))
    .join("");
  if (!profile.baseStats.length && !tags) {
    return `${dataUnavailable(t("The base stats and tags of this hero have not been entered yet."))}${edit}`;
  }
  const rows = profile.baseStats
    .map(entry => ({ entry, stat: index.stats.get(entry.statId) }))
    .filter(row => row.stat);
  const level = Math.min(MAX_LEVEL, Math.max(1, state.heroLevel));
  const table = rows.length
    ? `<table class="table hs-stats"><thead><tr><th scope="col">${t("Stat")}</th><th scope="col" class="r">${t("Level 1")}</th><th scope="col" class="r">${t("Level {level}", { level: MAX_LEVEL })}</th><th scope="col" class="r level-now" data-level-label>${t("At level {level}", { level })}</th></tr></thead><tbody>${rows
        .map(({ entry, stat }) =>
          isChoice(stat)
            ? // a choice (Melee or Ranged) does not grow: one cell for the three columns
              `<tr><th scope="row">${escapeHtml(tx(stat.name))}</th><td class="r" colspan="3"><b>${escapeHtml(tx(optionOf(stat, entry.option)?.name ?? "—"))}</b></td></tr>`
            : `<tr><th scope="row">${escapeHtml(tx(stat.name))}</th><td class="r">${shownStat(stat, entry.value)}</td><td class="r">${shownStat(stat, statAtLevel(entry, MAX_LEVEL))}</td><td class="r"><b data-level-stat="${stat.id}">${shownStat(stat, statAtLevel(entry, level))}</b></td></tr>`
        )
        .join(
          ""
        )}</tbody></table><div class="lvl"><b data-level-output>${t("Level {level}", { level })}</b><input type="range" min="1" max="${MAX_LEVEL}" value="${level}" id="hero-level" aria-label="${t("Level")}"></div>`
    : "";
  return `${tags ? `<div class="tag-line">${tags}</div>` : ""}${table}${edit}`;
}

/**
 * The numbers of one spell, as entered by an administrator: cooldown and cost by level, range, cast
 * time, each effect with its values and scaling.
 */
export function skillDetailsMarkup(skill, catalog, escapeHtml) {
  if (!skill) {
    return "";
  }
  const index = indexCatalog(catalog ?? { stats: [], tags: [], items: [], arcana: [] });
  const values = (list, unit = "flat") =>
    list.map(value => `${number(value)}${unit === "percent" ? "%" : ""}`).join(" / ");
  const facts = [
    skill.cooldown.length ? [t("Cooldown (s)"), values(skill.cooldown)] : null,
    skill.cost.length ? [tx(skill.costLabel) || t("Cost"), values(skill.cost)] : null,
    skill.range !== null ? [t("Range"), number(skill.range)] : null,
    skill.castTime !== null ? [t("Cast time (s)"), number(skill.castTime)] : null
  ].filter(Boolean);
  const kindLabel = kind =>
    ({
      damage: t("Damage"),
      heal: t("Heal"),
      shield: t("Shield"),
      control: t("Control"),
      buff: t("Buff"),
      debuff: t("Debuff"),
      movement: t("Movement"),
      other: t("Other")
    })[kind] ?? kind;
  const parts = skill.components
    .map(
      part =>
        `<tr><th scope="row">${escapeHtml(tx(part.label))} <span class="skill-tag">${kindLabel(part.kind)}</span></th><td>${part.values.length ? values(part.values, part.unit) : "—"}${part.scaling.length ? `<br><span class="muted">${part.scaling.map(scale => t("+{percent}% {stat}", { percent: number(scale.percent), stat: escapeHtml(tx(index.stats.get(scale.statId)?.name ?? "")) })).join(" ")}</span>` : ""}${part.text ? `<br><span class="muted">${escapeHtml(tx(part.text))}</span>` : ""}</td></tr>`
    )
    .join("");
  return `<div class="skill-numbers">${facts.length ? `<ul class="stat-list">${facts.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join("")}</ul>` : ""}${parts ? `<table class="skill-table"><tbody>${parts}</tbody></table>` : ""}${skill.notes ? `<p class="muted">${escapeHtml(tx(skill.notes))}</p>` : ""}</div>`;
}
