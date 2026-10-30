// Which views the server draws, which get a frame, and the paths of the frames.

/** Views whose first screen can be drawn for a visitor with no session. */
export const SSR_VIEWS = new Set([
  "home",
  "heroes",
  "hero",
  "tier-lists",
  "scrims",
  "history",
  "build-lab",
  "teams",
  "find",
  "login",
  "register",
  "training",
  "welcome",
  "settings",
  "items",
  "arcana",
  "spells",
  "popular",
  "terms",
  "privacy",
  "cookies",
  "legal",
  "contact"
]);

/**
 * Views whose page a person who is signed in receives drawn before its data arrives (a "frame": the title, the
 * introduction and the skeleton of the page, the same for everybody, see prerender.js). The browser's script fills it
 * with the person's data. A view is added here once its frame has been looked at.
 */
export const FRAME_VIEWS = new Set([
  "scrims",
  "history",
  "tier-lists",
  "settings",
  "space",
  "agenda",
  "inbox",
  "discord",
  "find",
  "reports",
  "tournaments",
  "guides",
  "training"
]);

/** The pages of the training area that have a frame (any other, an exercise or a situation, is the plain shell). */
export const TRAINING_PATHS = [
  "/training",
  "/training/notebook",
  "/training/scenarios",
  "/training/reflex"
];

/**
 * The address the frame of a series in its draft is drawn from: an id that no series has. The person who opens a series
 * whose game is being drafted receives the room of the draft drawn (the two sides, the clock, nothing in them yet).
 */
export const ROOM_FRAME_PATH = "/scrims/00000000-0000-4000-8000-000000000000";

/** The first-paint pack of that frame (client/styles/first-paint.json): the scrims sheets and the ones of the board. */
export const ROOM_FRAME_VIEW = "scrims-room";

/** Public views whose page waits for what the address of a link carries: a visitor gets a frame of them too. */
export const VISITOR_FRAME_VIEWS = new Set(["space-shared"]);

/** The address each frame view is drawn from (and warmed at start-up): the page of the view with nothing chosen in it. */
export const FRAME_PATHS = {
  scrims: "/scrims",
  history: "/history",
  "tier-lists": "/tier-lists",
  settings: "/settings",
  space: "/space",
  agenda: "/agenda",
  inbox: "/inbox",
  discord: "/discord",
  find: "/find",
  reports: "/reports",
  tournaments: "/tournaments",
  guides: "/guides",
  training: "/training"
};

/** The cookie of a session (the prefix is the one of production). */
export const SESSION_COOKIE = /(^|;\s*)(__Host-)?hok_session=/;

/** Open Graph locale of each language. */
export const OG_LOCALES = {
  en: "en_US",
  fr: "fr_FR",
  es: "es_ES",
  pt: "pt_BR",
  de: "de_DE",
  it: "it_IT",
  ru: "ru_RU",
  tr: "tr_TR",
  id: "id_ID",
  vi: "vi_VN",
  th: "th_TH",
  ar: "ar_AR",
  ja: "ja_JP",
  ko: "ko_KR",
  zh: "zh_CN"
};
