// The overview tab of a hero: the blocks it is made of (skills, video, profile, build, stats, pairings, peers, patch, artwork).
import { buildDigests } from "./hero-builds.js";
import { classLabel, laneName as fullLaneName, laneLabel } from "../../domain/lanes.js";
import { deferred, responsive } from "../../../shared/media.js";
import { escapeHtml } from "../../lib/dom.js";
import { formatDate, formatSeconds } from "../../lib/format.js";
import { gapLine, skillLabel, toneText } from "./hero-sheet-parts.js";
import * as heroStats from "./hero-stats.js";
import { icon } from "../../../shared/icons.js";
import { state } from "../../app/app-state.js";
import { t } from "../../app/browser-i18n.js";
import { artTitle, head, missingSheet, patchEntry, skillPicture } from "./hero-panels-shared.js";

// ---- layout: blocks of 12 columns, filled row after row, a lone block takes the whole row -----------

/**
 * `{ span, html }` blocks as two stacked columns, the wide one (span 7 and more) and the narrow one (span 5 and less), so that a
 * block is only as tall as its content: in rows, the shorter block of a row was stretched to the taller one and held an empty
 * space. A block of the whole width (12) cuts the flow; when only one column has blocks, each takes the whole row.
 */
export function rowsOf(blocks) {
  const out = [];
  const wide = [];
  const side = [];
  const one = block => `<div class="hs-row hs-row--one">${block.html}</div>`;
  const flush = () => {
    if (wide.length && side.length) {
      out.push(
        `<div class="hs-cols"><div class="hs-col hs-col--wide">${wide.map(block => block.html).join("")}</div><div class="hs-col hs-col--side">${side.map(block => block.html).join("")}</div></div>`
      );
    } else {
      out.push(...[...wide, ...side].map(one));
    }
    wide.length = 0;
    side.length = 0;
  };
  for (const block of blocks.filter(Boolean)) {
    if (block.span >= 12) {
      flush();
      out.push(one(block));
    } else {
      (block.span >= 6 ? wide : side).push(block);
    }
  }
  flush();
  return out.join("");
}

/** A link-looking button that opens another tab of the sheet. */
/** A peer is a 3:4 card that its square picture covers (see CARD_SIZES in lib/dom.js): drawn as wide as the card is tall. */
const PEER_SIZES = "(min-width: 1000px) 250px, 120px";

const toTab = (tab, label) =>
  `<button type="button" class="link hs-more" data-action="hero-tab" data-tab="${tab}" data-target="hero-${tab}">${label}${icon("arrow", "i--sm")}</button>`;

// ---- the overview -------------------------------------------------------------------------------

/** The skills as big pictures with the first words of their description; a click opens the skill. */
function overviewSkills(details) {
  if (!details?.skills?.length) {
    return null;
  }
  return {
    span: 7,
    html: `<section class="hs-mod hs-mod--skills" id="hero-overview-skills">${head(t("Skills"), toTab("skills", t("See all")))}<ol class="hs-skilllist">${details.skills
      .map(
        skill =>
          `<li><button type="button" class="hs-skill" data-action="skill-open" data-skill-index="${skill.index}" aria-label="${escapeHtml(skill.name)}">${skillPicture(skill, 80, "hs-skill__icon")}<span class="hs-skill__main"><span class="hs-skill__title"><b>${escapeHtml(skill.name)}</b><small>${escapeHtml(skillLabel(skill))}${skill.cooldownSeconds ? ` · ${escapeHtml(formatSeconds(skill.cooldownSeconds))}` : ""}</small></span><span class="hs-skill__desc">${toneText(skill.description.slice(0, 40))}</span></span>${icon("right", "i--sm")}</button></li>`
      )
      .join("")}</ol></section>`
  };
}

/** The presentation video of the hero (Camp's own), framed, with its frame at half a second showing before the play. */
function overviewVideo(details, hero) {
  const src = details?.world?.video;
  if (!src) {
    return null;
  }
  return {
    span: 7,
    html: `<section class="hs-mod hs-mod--card hs-mod--video" id="hero-presentation">${head(t("Hero presentation"))}<div class="hs-player"><video class="lore-video" data-src="${escapeHtml(src)}#t=0.5" controls muted playsinline preload="none" aria-label="${t("Hero profile video")}"></video><button type="button" class="hs-player__play" data-action="load-lore-video" aria-label="${t("Play profile video")}">${icon("play", "i--fill")}</button></div><div class="hstack wrap bg-tools"><button type="button" class="btn btn--sm" data-action="bg-choose" data-hero-id="${escapeHtml(hero.id)}">${t("Use as page background")}</button><button type="button" class="btn btn--ghost btn--sm" data-action="bg-random">${t("Random background")}</button></div></section>`
  };
}

/** The biography: who the hero is, in a list of facts that fills its block. */
function overviewProfile(details, hero) {
  if (!details) {
    return null;
  }
  const facts = [
    [t("Region"), details.world.region],
    [t("Height"), details.world.height],
    [t("Energy"), details.world.energy],
    [
      t("Class"),
      [details.mainClass, details.minorClass].filter(Boolean).map(classLabel).join(" / ")
    ],
    [t("Camp lane"), details.lane ? laneLabel(details.lane) || details.lane : ""]
  ].filter(([, value]) => value);
  const released = details.listedAt ? formatDate(details.listedAt) : "";
  if (!facts.length && !released) {
    return null;
  }
  const emblem = details.art?.worldIcon ?? hero.image;
  // the day the hero came to Global is the big figure of the block; the identity is already the title of the scene
  const top =
    emblem || released
      ? `<div class="hs-profile__top">${emblem ? `<img class="hs-profile__emblem" ${responsive(emblem, 96)} alt="" width="96" height="96" loading="lazy" decoding="async">` : ""}${released ? `<p class="hs-profile__big"><b>${escapeHtml(released)}</b><small>${t("Released on Global")}</small></p>` : ""}</div>`
      : "";
  return {
    span: 5,
    html: `<section class="hs-mod hs-mod--card hs-mod--profile">${head(t("Profile"), `<span class="pill pill--grey">${t("Camp · Global")}</span>`)}${top}<dl class="hs-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></section>`
  };
}

/** The first recommended build, in short; the stats of the hero under it when they were entered. */
function overviewBuild(sheet, ctx, isEditor) {
  const set = (sheet.builds ?? [])[0];
  if (!ctx.catalog || !set) {
    return null;
  }
  return {
    span: 5,
    html: `<section class="hs-mod hs-mod--card hs-mod--build">${head(t("Recommended builds"), toTab("builds", t("See all")))}<div class="hs-digests">${buildDigests(sheet.builds, ctx, { isEditor })}</div></section>`
  };
}

/** The base stats an administrator entered: the table, the level slider, the tags. */
function overviewStats(sheet, ctx) {
  const profile = sheet.profile;
  const empty = !profile.baseStats.length && !(profile.tags ?? []).length;
  if (empty) {
    return null;
  }
  return {
    span: 5,
    html: `<section class="hs-mod hs-mod--card hs-mod--stats">${head(t("Hero stats"), `<span class="pill pill--grey">${t("Entered by hand")}</span>`)}${heroStats.profileStatsSection(sheet, ctx)}</section>`
  };
}

/** Who goes with this hero and who it meets, from the tournaments; nothing when no game was won. */
function overviewPairings(sheet, ctx) {
  const body = heroStats.pairingsDigest(sheet, ctx);
  return body
    ? {
        span: 5,
        html: `<section class="hs-mod hs-mod--card hs-mod--pairings">${head(t("Pairings"), toTab("competitive", t("See all")))}${body}</section>`
      }
    : null;
}

/** The other heroes that play the same lane: always there, a way to move on to the next sheet. */
function overviewPeers(hero) {
  const lane = hero.lanes?.[0];
  if (!lane) {
    return null;
  }
  const peers = state.heroes
    .filter(
      item => item.id !== hero.id && item.availableGlobal !== false && item.lanes?.includes(lane)
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 8);
  if (!peers.length) {
    return null;
  }
  return {
    span: 7,
    html: `<section class="hs-mod hs-mod--peers">${head(t("Other heroes in {lane}", { lane: escapeHtml(fullLaneName(lane)) }))}<ul class="hs-peers">${peers
      .map(
        peer =>
          `<li><button type="button" class="hs-peer" data-action="open-hero" data-hero-id="${escapeHtml(peer.id)}" aria-label="${escapeHtml(peer.displayName || peer.name)}">${peer.image ? `<img ${responsive(peer.image, 160, PEER_SIZES)} alt="" width="128" height="128" loading="lazy" decoding="async">` : `<span class="image-fallback"></span>`}<b>${escapeHtml(peer.displayName || peer.name)}</b></button></li>`
      )
      .join("")}</ul></section>`
  };
}

/** The latest balance change: the season, what was said, the first two skills it touched. */
function overviewPatch(details) {
  const entries = (details?.adjustments ?? []).slice(0, 2);
  if (!entries.length) {
    return null;
  }
  return {
    span: 7,
    html: `<section class="hs-mod hs-mod--card hs-mod--patch">${head(t("Patch history"), toTab("patches", t("See all")))}<ol class="patch-list patch-list--one">${entries.map(entry => patchEntry({ ...entry, changes: entry.changes.slice(0, 2) })).join("")}</ol></section>`
  };
}

/** A few of the official pictures; the whole gallery is one click away. */
function overviewArtwork(details) {
  const gallery = (details?.gallery ?? []).slice(0, 4);
  if (!gallery.length) {
    return null;
  }
  return {
    span: 5,
    html: `<section class="hs-mod hs-mod--art">${head(t("Artwork"), toTab("artwork", t("See all")))}<ul class="hs-thumbs hs-thumbs--${gallery.length}">${gallery
      .map(
        item =>
          `<li><a class="hs-thumb" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(artTitle(item))}"><img ${deferred(item.url, [320, 640], "(min-width: 1000px) 20vw, 50vw")} alt="${escapeHtml(artTitle(item) || t("Artwork"))}" loading="lazy" decoding="async"></a></li>`
      )
      .join("")}</ul></section>`
  };
}

/**
 * The overview: the presentation and the biography, the skills and the build, the hero stats, who it
 * plays with, the heroes of its lane, its latest patch and its artwork. What is missing is ONE line
 * under all that, with the action that would fill it.
 */
export function overviewPanel(sheet, ctx, { isEditor, isAdmin }) {
  const hero = sheet.hero;
  const details = sheet.details;
  const id = encodeURIComponent(hero.id);
  const blocks = [
    overviewVideo(details, hero),
    overviewProfile(details, hero),
    overviewSkills(details),
    overviewBuild(sheet, ctx, isEditor),
    overviewStats(sheet, ctx),
    overviewPairings(sheet, ctx),
    overviewPeers(hero),
    overviewPatch(details),
    overviewArtwork(details)
  ];
  const labLink = `<a class="btn btn--sm" href="/build-lab?h=${id}">${icon("cube", "i--sm")}${t("Open the build lab")}</a>`;
  const gaps = [
    !details
      ? gapLine(t("Profile"), missingSheet())
      : !blocks[2]
        ? gapLine(t("Skills"), t("Camp lists no skills for this hero."))
        : "",
    !blocks[3]
      ? gapLine(
          t("Recommended builds"),
          t("No build has been entered for this hero yet."),
          `<span class="hs-gap__actions">${labLink}${isEditor ? `<a class="btn btn--ghost btn--sm" href="/guides/${id}">${icon("pencil", "i--sm")}${t("Edit the builds")}</a>` : ""}</span>`
        )
      : "",
    !blocks[4]
      ? gapLine(
          t("Hero stats"),
          t("The base stats and tags of this hero have not been entered yet."),
          isAdmin
            ? `<span class="hs-gap__actions"><button type="button" class="btn btn--sm" data-action="edit-hero-data">${t("Edit hero data")}</button></span>`
            : ""
        )
      : "",
    !blocks[5]
      ? gapLine(
          t("Pairings"),
          sheet.tournament?.totalGames
            ? t("This hero has no won game in this period.")
            : t("No tournament has been entered yet.")
        )
      : "",
    details && !blocks[7]
      ? gapLine(t("Patch history"), t("Camp lists no balance changes for this hero."))
      : "",
    details && !blocks[8]
      ? gapLine(t("Artwork"), t("No official artwork is published for this hero."))
      : ""
  ].filter(Boolean);
  return `${rowsOf(blocks)}${gaps.length ? `<ul class="hs-gaps hs-gaps--end">${gaps.join("")}</ul>` : ""}`;
}
