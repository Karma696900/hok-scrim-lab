// The buttons (data-action) each page that is downloaded on demand answers to, and the files that register them. Many of them
// are on other pages too (New series on the overview, Export on a series, Open a hero everywhere): the application listens for
// them from the start and the first click brings the page (app/lazy-pages.js, onLazyActions). app/lazy-actions.test.js keeps
// this table and the onAction calls of those files in step.
export const LAZY_ACTIONS = {
  heroes: {
    files: [
      "features/heroes/hero-actions-sheet.js",
      "features/heroes/hero-actions-list.js",
      "features/heroes/hero-actions-roster.js"
    ],
    names: [
      "hero-tab",
      "skill-open",
      "hero-piece",
      "build-variant",
      "digest-variant",
      "train-hero",
      "lane-filter",
      "class-filter",
      "filter-remove",
      "hero-reset",
      "filters-toggle",
      "scroll-top",
      "hero-view",
      "skill-tab",
      "sync-roster",
      "sync-details",
      "open-hero",
      "load-lore-video",
      "bg-choose",
      "bg-random",
      "close-hero",
      "edit-hero-data",
      "add-hero-lane",
      "remove-hero-lane",
      "remove-hero-alias"
    ]
  },
  scrims: {
    files: ["features/scrims/scrim-actions.js", "features/scrims/teams.js"],
    names: [
      "new-series",
      "open-series",
      "back-series",
      "view-game",
      "scrim-tab",
      "focus-new-series",
      "quick-series",
      "set-game-mode",
      "set-draft-mode",
      "start-game",
      "start-local-draft",
      "start-side",
      "draft-pick",
      "copy-invite",
      "advance-draft",
      "timer-start",
      "timer-pause",
      "timer-finish",
      "edit-draft",
      "import-series",
      "delete-series",
      "toggle-teams",
      "share-team-add",
      "share-team-remove"
    ]
  },
  history: {
    files: ["features/history/history-actions.js"],
    names: [
      "export-pdf",
      "history-page",
      "hero-page",
      "history-reset",
      "history-range",
      "open-export"
    ]
  },
  home: {
    files: ["features/home/home-actions.js"],
    names: ["home-tab", "home-lane"]
  },
  tierLists: {
    files: ["features/tier-lists/tier-list-actions.js"],
    names: [
      "create-tier-list",
      "tier-lane-filter",
      "select-tier-list",
      "tier-pick",
      "tier-send",
      "tier-cancel",
      "tier-reserve-lane",
      "add-tier",
      "remove-tier",
      "move-tier",
      "delete-tier-list",
      "export-tier-list",
      "import-tier-list"
    ]
  }
};
