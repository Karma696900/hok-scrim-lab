// Pure normalisers for the public JSON that HOK Camp (Global, lang_type=en) serves to its own hero
// pages. Rules: ids come from Camp's own heroId (never matched by name), ranked fields
// (hot/winRate/matchRate/banRate, combination percentages, popularity) are NEVER read, URLs are
// restricted to known Global hosts, and text is turned into plain data (colour segments), never
// HTML.

// Exact host names, never a suffix: anybody can open a storage bucket under a cloud provider's domain, and
// the image proxy would then fetch (and keep) whatever that person puts there. The three hosts the hero
// data really uses; a new one is added here, on purpose.
const MEDIA_HOSTS = new Set([
  "camp.honorofkings.com",
  "res.sgameglobal.com",
  "1500020538.vod2.myqcloud.com"
]);

const LANE_BY_ROAD_NAME = new Map([
  ["Clash Lane", "Clash Lane"],
  ["Mid Lane", "Mid Lane"],
  ["Farm Lane", "Farm Lane"],
  ["Jungling", "Jungle"],
  ["Roaming", "Roamer"]
]);

/** https URL on a Camp media host, otherwise null. */
export function safeMediaUrl(value) {
  if (typeof value !== "string" || value.length > 600) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return null;
    }
    return MEDIA_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

const text = (value, max = 400) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .trim()
        .slice(0, max)
    : "";
const color = value =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const integer = value => (Number.isInteger(value) ? value : null);

/**
 * `Deals <color=#ff6600>damage</color>.<br>x` -> [{ t: "Deals ", c: null }, { t: "damage", c:
 * "#ff6600" }, { t: ".\nx", c: null }]
 */
export function parseColorText(source, max = 1500) {
  const raw = text(String(source ?? ""), max)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const segments = [];
  const pattern = /<color=(#[0-9a-fA-F]{6})>([\s\S]*?)<\/color>/g;
  let last = 0;
  const strip = value => value.replace(/<[^>]*>/g, "");
  const push = (value, tone) => {
    const cleaned = strip(value);
    if (cleaned) {
      segments.push({ t: cleaned, c: tone });
    }
  };
  for (const match of raw.matchAll(pattern)) {
    push(raw.slice(last, match.index), null);
    push(match[2], color(match[1]));
    last = match.index + match[0].length;
  }
  push(raw.slice(last), null);
  return segments.slice(0, 80);
}

/** Camp's hero list (`getallherobriefinfo`): identity, class, lane and portrait only. */
export function normalizeBriefList(payload) {
  const rows = payload?.data?.heroList;
  if (payload?.code !== 0 || !Array.isArray(rows)) {
    throw new Error("Camp returned an invalid hero list.");
  }
  const ids = new Set();
  const heroes = rows.flatMap(row => {
    // Camp lists a hero before its release with no picture yet (on 7 October 2026: Wang Wei, 138). It
    // has no portrait to show, so it is left out until Camp gives it one: it must not stop the other
    // heroes from being read. A picture that is there but is not a Camp one is still refused below.
    if (row?.icon === undefined || row?.icon === null || row?.icon === "") {
      return [];
    }
    const id = String(row?.heroId ?? "");
    const name = text(row?.heroName, 160);
    const image = safeMediaUrl(row?.icon);
    const lane = LANE_BY_ROAD_NAME.get(row?.recommendRoadName);
    const roles = [row?.mainJobName, row?.minorJobName]
      .map(value => text(value, 40))
      .filter(Boolean);
    if (!/^\d+$/.test(id) || ids.has(id) || !name || !image || !lane || !roles.length) {
      throw new Error("Camp hero list failed identity, lane, class or portrait validation.");
    }
    ids.add(id);
    return [{ id, name, image, roles: [...new Set(roles)], lanes: [lane], sourceIds: [id] }];
  });
  if (heroes.length < 70) {
    throw new Error(`Camp returned an incomplete hero list (${heroes.length} heroes).`);
  }
  return heroes.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Localized names and classes from Camp's hero list in another language: identity only (ids come
 * from Camp, never from names).
 */
export function normalizeLocalizedNames(payload, knownIds) {
  const rows = payload?.data?.heroList;
  if (payload?.code !== 0 || !Array.isArray(rows)) {
    throw new Error("Camp returned an invalid hero list.");
  }
  const entries = [];
  for (const row of rows) {
    const id = String(row?.heroId ?? "");
    const name = text(row?.heroName, 160);
    const roles = [
      ...new Set(
        [row?.mainJobName, row?.minorJobName].map(value => text(value, 40)).filter(Boolean)
      )
    ];
    if (knownIds.has(id) && name && roles.length) {
      entries.push({ id, name, roles });
    }
  }
  if (entries.length < Math.min(70, knownIds.size * 0.8)) {
    throw new Error(`Camp returned an incomplete localized hero list (${entries.length} heroes).`);
  }
  return entries;
}

function normalizeSkill(skill) {
  const index = integer(skill?.skillIndex);
  const name = text(skill?.skillName, 120);
  if (index === null || !name) {
    return null;
  }
  const type = skill.isPassive ? "passive" : skill.isUlt ? "ultimate" : "skill";
  const cooldown =
    Number.isFinite(skill.skillCd) && skill.skillCd > 0 ? skill.skillCd / 1000 : null;
  const cost =
    Number.isFinite(skill?.skillCostList?.skillCost) && skill.skillCostList.skillCost > 0
      ? skill.skillCostList.skillCost
      : null;
  return {
    id: String(skill.skillId ?? ""),
    index,
    type,
    label: type === "passive" ? "Passive" : type === "ultimate" ? "Ultimate" : `Skill ${index}`,
    name,
    icon: safeMediaUrl(skill.skillIcon),
    description: parseColorText(skill.skillDesc),
    cost,
    cooldownSeconds: cooldown,
    tags: (Array.isArray(skill.skillTag) ? skill.skillTag : [])
      .slice(0, 8)
      .map(tag => ({ name: text(tag?.name, 40), color: color(tag?.backgroundColor) }))
      .filter(tag => tag.name),
    video: safeMediaUrl(skill.skillVideo)
  };
}

function tagOf(contentTag) {
  return { text: text(contentTag?.text, 40), color: color(contentTag?.fontColorH5?.slice(0, 7)) };
}

/** Adjustment history (`adjustheroinfo`.adjustInfo, or heroData.adjustData for a summary). */
export function normalizeAdjustments(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(entry => {
    const content = entry?.adjustContent ?? {};
    return {
      seasonId: text(String(entry?.seasonId ?? ""), 8),
      seasonName: text(entry?.seasonName, 20),
      version: text(entry?.versionName, 40),
      publishedAt:
        typeof entry?.versionPublishTime === "string" &&
        Number.isFinite(Date.parse(entry.versionPublishTime))
          ? entry.versionPublishTime
          : null,
      current: entry?.isCurrent === true,
      summary: text(content.shortDesc, 300),
      tag: tagOf(content.contentTag),
      changes: (Array.isArray(content.attribute) ? content.attribute : [])
        .slice(0, 20)
        .map(change => ({
          title: text(change?.title, 120),
          text: parseColorText(change?.attributeDesc, 1200)
            .map(segment => segment.t)
            .join("")
            .trim(),
          skill: change?.heroSkillInfo
            ? {
                label: text(change.heroSkillInfo.skillIndexDesc, 40),
                name: text(change.heroSkillInfo.skillName, 120),
                icon: safeMediaUrl(change.heroSkillInfo.skillIcon)
              }
            : null
        }))
        .filter(change => change.text)
    };
  });
}

function normalizeCinematic(cg) {
  const video = cg?.video;
  const info = video?.videoInfo;
  if (!video || !info) {
    return null;
  }
  const sources = (Array.isArray(info.transcodeInfo) ? info.transcodeInfo : [])
    .map(item => ({
      height: integer(item?.height),
      width: integer(item?.width),
      url: safeMediaUrl(item?.mediaURL)
    }))
    .filter(item => item.url && item.height)
    .sort((left, right) => left.height - right.height);
  return {
    title: text(video.title1, 120),
    cover: safeMediaUrl(cg.videoCover) ?? safeMediaUrl(info.coverURL),
    durationSeconds: Number.isFinite(info.duration) ? info.duration : null,
    sources // unsigned: playback needs a short-lived signed link from Camp (see docs/HERO_DATA_SOURCES.md)
  };
}

/**
 * `getherodataall` -> the hero sheet's data. `adjustments` (adjustheroinfo) replaces the summary
 * list when available.
 */
export function normalizeHeroDetails(payload, adjustPayload = null) {
  const data = payload?.data;
  const info = data?.baseInfo?.heroInfo;
  if (payload?.code !== 0 || !info || !Number.isInteger(info.heroId)) {
    throw new Error("Camp returned an invalid hero detail response.");
  }
  const world = data.worldData?.world ?? {};
  const display = data.baseInfo.displayData ?? {};
  const skillSets = Array.isArray(data.strategyData?.skill) ? data.strategyData.skill : [];
  const skills = (skillSets[0]?.skillList ?? [])
    .map(normalizeSkill)
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
  const detailedAdjustments =
    adjustPayload?.code === 0 ? normalizeAdjustments(adjustPayload.data?.adjustInfo) : null;
  const gallery = (Array.isArray(data.worldData?.libraryList) ? data.worldData.libraryList : [])
    .slice(0, 40)
    .map(item => ({
      id: String(item?.image?.id ?? ""),
      title: text(item?.image?.title1, 120),
      subtitle: text(item?.image?.title2, 120),
      url: safeMediaUrl(item?.image?.oriPicUrl),
      width: integer(item?.image?.oriPicWidth),
      height: integer(item?.image?.oriPicHeight)
    }))
    .filter(item => item.url);
  return {
    schema: 1,
    campHeroId: String(info.heroId),
    name: text(info.heroName, 160),
    mainClass: text(info.mainJobName, 40),
    minorClass: text(info.minorJobName, 40) || null,
    lane: LANE_BY_ROAD_NAME.get(info.recommendRoadName) ?? null,
    listedAt:
      typeof data.heroData?.heroListingTime === "string" &&
      Number.isFinite(Date.parse(data.heroData.heroListingTime))
        ? data.heroData.heroListingTime
        : null,
    firstSkillToLevel: integer(info.firstTimeUpgradeSkill),
    art: {
      cover: safeMediaUrl(display.heroCover),
      coverColor: color(display.heroCoverColor),
      worldIcon: safeMediaUrl(display.heroWorldIcon)
    },
    skills,
    world: {
      height: text(world.height, 60) || null,
      region: text(world.region, 60) || null,
      identity: text(world.identity, 80) || null,
      energy: text(world.energy, 60) || null,
      video: safeMediaUrl(world.video?.videoUrl)
    },
    gallery,
    cinematic: normalizeCinematic(data.baseInfo.cg),
    adjustments: detailedAdjustments ?? normalizeAdjustments(data.heroData?.adjustData),
    adjustmentsDetailed: Boolean(detailedAdjustments)
  };
}
