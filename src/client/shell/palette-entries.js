// What the command palette can open: the pages of the menu, the heroes, the pieces of the game; and which of them to show.
import { api } from "../app/api-client.js";
import { catalogImageAttrs } from "../domain/catalog-display.js";
import { contentReady, tx } from "../domain/staff-content.js";
import { icon } from "../../shared/icons.js";
import { slotImage } from "../lib/dom.js";
import { state } from "../app/app-state.js";
import { t } from "../app/browser-i18n.js";

/** The pages the person can open from the menu, plus the ones that have no entry in it. */
export function pageEntries() {
  const entries = [];
  for (const link of document.querySelectorAll("#main-nav .nav-link")) {
    if (!link.hidden) {
      entries.push({
        group: "pages",
        label: link.querySelector("span").textContent,
        href: link.getAttribute("href"),
        lead: link.querySelector("svg")?.outerHTML ?? icon("grid")
      });
    }
  }
  const extra = [
    ["/history", t("History"), "clock", true],
    ["/build-lab", t("Build lab"), "cube", true],
    ["/account", t("Account security"), "lock", Boolean(state.auth.user)],
    ["/discord", t("Discord"), "discord", Boolean(state.auth.user)]
  ];
  for (const [href, label, name, shown] of extra) {
    if (shown && !entries.some(entry => entry.href === href)) {
      entries.push({ group: "pages", label, href, lead: icon(name) });
    }
  }
  return entries;
}

export const heroEntries = () =>
  state.heroes
    .filter(hero => hero.availableGlobal !== false)
    .map(hero => ({
      group: "heroes",
      label: hero.displayName || hero.name,
      hint: (hero.lanes ?? []).join(" · "),
      href: `/heroes/${encodeURIComponent(hero.id)}`,
      lead: `<span class="pt" data-size="28">${slotImage(hero)}</span>`
    }));

export const GROUP_LABELS = () => ({
  pages: t("Pages"),
  heroes: t("Heroes"),
  items: t("Items"),
  arcana: t("Arcana"),
  spells: t("Spells"),
  teams: t("Teams")
});

const GROUP_ORDER = ["pages", "heroes", "items", "arcana", "spells", "teams"];

const COLOR_LABELS = () => ({ red: t("Red"), blue: t("Blue"), green: t("Green") });

let pieces = null; // the pieces of the game, asked for once, the first time somebody types

/** The items, arcana and spells of the catalogue (a page for each opens on the piece), or none when it cannot be had. */
export function pieceEntries() {
  pieces ??= Promise.all([api("/api/catalog"), contentReady()])
    .then(([catalog]) => {
      const colors = COLOR_LABELS();
      const make = (group, piece) => ({
        group,
        label: tx(piece.name),
        alt: piece.name, // the name as it was written, found whatever the language of the page
        hint: group === "arcana" ? (colors[piece.color] ?? "") : "",
        href: `/${group}/${piece.id}`,
        lead: piece.imageId
          ? `<img class="palette__piece" ${catalogImageAttrs(piece.imageId, 28)} alt="" width="28" height="28" loading="lazy" decoding="async">`
          : `<span class="palette__piece"></span>`
      });
      return ["items", "arcana", "spells"].flatMap(group =>
        (catalog[group] ?? []).map(piece => make(group, piece))
      );
    })
    .catch(() => {
      pieces = null; // asked again at the next opening
      return [];
    });
  return pieces;
}

/** What is shown: a few of each group first, then what room is left, in the order of the groups. */
export function pick(matching, room) {
  const taken = new Set();
  const perGroup = new Map();
  for (const entry of matching) {
    const count = perGroup.get(entry.group) ?? 0;
    if (count < 4 && taken.size < room) {
      perGroup.set(entry.group, count + 1);
      taken.add(entry);
    }
  }
  for (const entry of matching) {
    if (taken.size < room) {
      taken.add(entry);
    }
  }
  return GROUP_ORDER.flatMap(group =>
    matching.filter(entry => entry.group === group && taken.has(entry))
  );
}

/** A team found by the search. */
export const teamEntry = team => ({
  group: "teams",
  label: team.name,
  hint: `#${team.tag}`,
  href: `/teams/${encodeURIComponent(team.id)}`,
  lead: icon("shieldcheck")
});
