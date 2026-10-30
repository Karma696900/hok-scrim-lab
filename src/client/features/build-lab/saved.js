// The builds a person keeps from the build lab, in their own browser: no account, several per hero.
// Nothing leaves the device. Pure functions over a list (and two on a storage): what is read back is
// checked, because a storage can be emptied, edited or filled by anything.
import { MAX_LEVEL, shapeBuild } from "../../../shared/build-model.js";

// what a stored build is made of is the shared model's (the server keeps builds the same way)
export { shapeBuild };

export const STORAGE_KEY = "hok.builds";
export const NAME_MAX = 60;
export const MAX_PER_HERO = 30;
export const MAX_IN_ALL = 300;

const ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/;
const HERO_PATTERN = /^[A-Za-z0-9_-]{0,80}$/;

/** One stored entry, or null when it is not one. */
export function cleanEntry(raw) {
  if (!raw || typeof raw !== "object" || !ID_PATTERN.test(String(raw.id ?? ""))) {
    return null;
  }
  const heroId = typeof raw.heroId === "string" ? raw.heroId : "";
  if (!HERO_PATTERN.test(heroId)) {
    return null;
  }
  const level = Number.isInteger(raw.level)
    ? Math.min(MAX_LEVEL, Math.max(1, raw.level))
    : MAX_LEVEL;
  return {
    id: raw.id,
    heroId,
    name: typeof raw.name === "string" ? raw.name.trim().slice(0, NAME_MAX) : "",
    level,
    build: shapeBuild(raw.build),
    savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : 0
  };
}

/** Every build kept in this browser, the most recently saved first. Never throws. */
export function readSaved(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set();
    return parsed
      .map(cleanEntry)
      .filter(entry => entry && !seen.has(entry.id) && seen.add(entry.id))
      .slice(0, MAX_IN_ALL)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** False when the browser refuses to keep them (a private window, a full storage). */
export function writeSaved(storage, entries) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** The builds of one hero ("" is the builds made without a hero). */
export const savedOf = (entries, heroId) => entries.filter(entry => entry.heroId === heroId);

/** "Build 3": the next free number among the builds of this hero. */
export function nextName(entries, heroId, label) {
  const used = new Set(savedOf(entries, heroId).map(entry => entry.name));
  for (let number = savedOf(entries, heroId).length + 1; ; number += 1) {
    if (!used.has(`${label} ${number}`)) {
      return `${label} ${number}`;
    }
  }
}

/**
 * Keeps a build. `{ entries, entry }` on success, `{ error }` when a limit is reached ("per-hero" or
 * "in-all"): nothing is dropped silently to make room.
 */
export function addSaved(entries, { id, heroId, name, level, build, now }) {
  if (savedOf(entries, heroId).length >= MAX_PER_HERO) {
    return { error: "per-hero" };
  }
  if (entries.length >= MAX_IN_ALL) {
    return { error: "in-all" };
  }
  const entry = cleanEntry({ id, heroId, name, level, build, savedAt: now });
  return { entries: [entry, ...entries], entry };
}

/** Replaces the content of a kept build (its name too, when one is given), as saved just now. */
export function updateSaved(entries, id, { name, level, build, now }) {
  return entries
    .map(entry =>
      entry.id === id
        ? cleanEntry({
            ...entry,
            name: name === undefined || name === "" ? entry.name : name,
            level,
            build,
            savedAt: now
          })
        : entry
    )
    .sort((a, b) => b.savedAt - a.savedAt);
}

export const removeSaved = (entries, id) => entries.filter(entry => entry.id !== id);
