export const state = {
  view: "home",
  heroes: [],
  roster: null,
  series: [],
  tierLists: [],
  activeSeriesId: null,
  trainingSection: "",
  modules: null, // the optional parts the person chose (null: all)
  onboarded: true,
  prefsFor: null,
  settings: {
    bestOf: 3,
    gameMode: "global-ban-pick",
    draftMode: "solo",
    startPage: "/",
    reduceMotion: false
  },
  activeTierId: null,
  laneFilter: "All",
  search: "",
  roleFilter: new Set(),
  skillIndex: 0,
  detailsSync: null,
  draftMode: "solo",
  advancing: false,
  polling: false,
  selectedHeroId: null,
  popularSection: "", // "" (the drafts) or "/heroes"
  guideHeroId: null, // the hero open in the guides editor
  gameMode: "global-ban-pick",
  auth: { enabled: false, user: null, registration: true }, // registration: whether the server takes new accounts
  clockOffset: 0,
  tierLaneFilter: "all",
  heroSheet: null,
  competitiveLoaded: false,
  viewGameIndex: null,
  overview: null,
  overviewLoading: false,
  home: null, // the events and the teams of the person, for the overview
  homeTab: "mine",
  scrimTab: "all", // the Scrims page: all, live or done
  scrimQuery: "",
  history: null,
  historyLoading: false,
  historyFilters: { status: "", mode: "", q: "", from: "", to: "" },
  historyPage: 1,
  heroPage: 1,
  heroSort: "name", // the hero index: by name or by lane
  heroLevel: 1, // the level the base stats of a hero sheet are shown at
  heroView: "grid", // the hero index: a grid of portraits or a list
  heroOrder: "presence",
  heroSearch: "",
  pickPending: false,
  advanceBlockedUntil: 0,
  quiet: false // a reflex exercise is running: the page makes no request of its own until it ends
};

export const LANES = ["All", "Clash Lane", "Jungle", "Mid Lane", "Farm Lane", "Roamer"];

export const BEST_OF_OPTIONS = [1, 2, 3, 4, 5, 7];

// While a reflex exercise runs the page holds still, so that nothing can disturb a time measured in
// milliseconds: the shell asks nothing of the server, the video behind the page is paused (and not
// started), the animations that never end stop where they are. Everything is back when the run is over.

export function setQuiet(on) {
  if (state.quiet === on) {
    return;
  }
  state.quiet = on;
  document.documentElement.classList.toggle("is-quiet", on);
  document.dispatchEvent(new CustomEvent("hok:quiet", { detail: on }));
}

/** Whether the server takes new accounts: the "Create account" buttons are not shown when it does not. */
export const canRegister = () => state.auth.registration !== false;
