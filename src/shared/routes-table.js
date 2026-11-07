// The table of the pages of the site: address, view, title, who may read it, whether search engines may index it.
import { message } from "./routes-shared.js";
import { API_ROUTES } from "./routes-table-api.js";
import { CASINO_ROUTES } from "./routes-table-casino.js";

export const ROUTES = [
  {
    pattern: /^\/$/,
    view: "home",
    index: true,
    title: message("{site} — HOK Honor of Kings draft simulator, scrims and tier list"),
    description: message(
      "Free Honor of Kings Global draft simulator: competitive ban and pick, scrim series, tier lists per lane and hero guides with skills and patch history."
    )
  },
  {
    pattern: /^\/heroes$/,
    view: "heroes",
    index: true,
    title: message("HOK heroes — every Honor of Kings hero, skills, builds and lanes | {site}"),
    description: message(
      "Every Honor of Kings Global hero with lane, class, skills, videos, artwork and balance changes from the official Camp data."
    )
  },
  { pattern: /^\/heroes\/(\d{1,6})$/, view: "hero", index: true, param: "heroId" },
  {
    // the public tier list: every lane, or one (the address ends with its slug); the server adds the month
    // to the title (page-handler-parts.js)
    pattern: /^\/tier-list(\/(?:clash|jungle|mid|farm|roam))?$/,
    view: "tier-list",
    index: true,
    param: "section",
    title: message("HOK Tier List — best Honor of Kings heroes for every lane | {site}"),
    description: message(
      "The Honor of Kings Global tier list of every lane, from SS to D: ranked by the tournament games of the last three months, and by the editors for the heroes played too little."
    )
  },
  {
    pattern: /^\/tier-lists$/,
    view: "tier-lists",
    index: true,
    title: message("HOK tier list maker — make your Honor of Kings tier list | {site}"),
    description: message(
      "Build and share Honor of Kings Global tier lists for all roles or a single lane with drag and drop."
    )
  },
  {
    pattern: /^\/scrims$/,
    view: "scrims",
    index: true,
    title: message("HOK scrims — Honor of Kings draft simulator with ban and pick | {site}"),
    description: message(
      "Run Honor of Kings Global scrim series with the competitive ban and pick order: a free draft simulator for teams, with a live draft room and the history of every game."
    )
  },
  {
    pattern: /^\/scrims\/([0-9a-f-]{36})$/i,
    view: "scrims",
    index: true,
    param: "seriesId",
    title: message("Series | {site}"),
    description: message("A scrim series.")
  },
  {
    pattern:
      /^\/training(\/notebook|\/reflex(?:\/[a-z]{3,16})?|\/scenarios(?:\/[0-9a-f-]{36})?)?$/i,
    view: "training",
    index: true,
    param: "section",
    title: message("HOK training — Honor of Kings combos, reflexes and map situations | {site}"),
    description: message(
      "Train for Honor of Kings Global: choose the heroes you work on, write down combos and mechanics, test your reflexes and study situations on the map."
    ),
    sections: {
      "/reflex": {
        title: message("HOK reflex training — Honor of Kings reaction and dodge drills | {site}"),
        description: message(
          "Reflex drills for Honor of Kings Global players: react, dodge and aim against the clock, and see how your times improve."
        )
      },
      "/scenarios": {
        title: message("HOK map situations — Honor of Kings macro training | {site}"),
        description: message(
          "Situations of Honor of Kings Global games drawn on the map: where to go, what to do, and why. Macro training for every lane."
        )
      }
    }
  },
  {
    pattern: /^\/settings$/,
    view: "settings",
    index: true,
    title: message("Settings | {site}"),
    description: message("Your parts of the site, defaults and interface.")
  },
  {
    pattern: /^\/welcome$/,
    view: "welcome",
    index: true,
    title: message("Welcome | {site}"),
    description: message("Choose the parts of the site you want to see.")
  },
  {
    pattern: /^\/live$/,
    view: "live",
    index: false,
    title: message("Live draft | {site}"),
    description: message("Open the draft in progress: the picks and bans of both sides, live.")
  },
  {
    pattern: /^\/history$/,
    view: "history",
    index: true,
    title: message("History and statistics | {site}"),
    description: message("Your recorded scrims and statistics.")
  },
  {
    pattern: /^\/tournaments$/,
    view: "tournaments",
    index: false,
    title: message("Tournaments | {site}"),
    description: message("Enter the real tournament series that were played.")
  },
  {
    pattern: /^\/teams$/,
    view: "teams",
    index: true,
    title: message("HOK teams — Honor of Kings Global team rosters and staff | {site}"),
    description: message(
      "Honor of Kings Global teams: create a team, invite players and staff, share an agenda and find scrim partners."
    )
  },
  {
    pattern: /^\/teams\/([0-9a-f-]{36})$/i,
    view: "team",
    index: true,
    param: "teamId",
    title: message("Team | {site}"),
    description: message("A team and its roster.")
  },
  {
    pattern: /^\/find$/,
    view: "find",
    index: true,
    title: message("Find a HOK scrim — Honor of Kings Global scrim partners | {site}"),
    description: message(
      "Open scrim announcements of Honor of Kings Global teams: filter by level, format and hero rule."
    )
  },
  {
    pattern: /^\/inbox$/,
    view: "inbox",
    index: false,
    title: message("Inbox | {site}"),
    description: message("Scrim requests and notifications.")
  },
  {
    pattern: /^\/agenda$/,
    view: "agenda",
    index: false,
    title: message("Agenda | {site}"),
    description: message("The agenda of your teams.")
  },
  {
    pattern: /^\/discord$/,
    view: "discord",
    index: false,
    title: message("Discord | {site}"),
    description: message("Link your Discord account.")
  },
  {
    pattern: /^\/players\/([A-Za-z0-9]{4,8})$/,
    view: "player",
    index: false,
    param: "tag",
    title: message("Player | {site}"),
    description: message("A player of the community.")
  },
  {
    pattern: /^\/build-lab$/,
    view: "build-lab",
    index: true,
    title: message("HOK build calculator — test Honor of Kings builds and stats | {site}"),
    description: message(
      "Try a build for any Honor of Kings Global hero: items, arcana and the total stats it gives. No account needed."
    )
  },
  {
    pattern: /^\/items(\/\d{1,9})?$/,
    view: "items",
    // the page of one piece of the catalogue: /items/12 (the server names it in the title)
    param: "section",
    index: true,
    title: message("HOK items — every Honor of Kings item with stats and price | {site}"),
    description: message(
      "Every item of Honor of Kings Global with its picture, price, stats, passives and actives, by slot and by shop category."
    )
  },
  {
    pattern: /^\/arcana(\/\d{1,9})?$/,
    view: "arcana",
    // the page of one piece of the catalogue: /arcana/12 (the server names it in the title)
    param: "section",
    index: true,
    title: message("HOK arcana — every Honor of Kings arcana, red, blue and green | {site}"),
    description: message(
      "Every arcana of Honor of Kings Global, red, blue and green, with the stats each one gives."
    )
  },
  {
    pattern: /^\/spells(\/\d{1,9})?$/,
    view: "spells",
    // the page of one piece of the catalogue: /spells/12 (the server names it in the title)
    param: "section",
    index: true,
    title: message("HOK spells — Honor of Kings summoner spells and cooldowns | {site}"),
    description: message(
      "The spells a player takes into an Honor of Kings Global match: what each one does, how long before it comes back and from which level."
    )
  },
  {
    pattern: /^\/simulation$/,
    view: "simulation",
    index: true,
    title: message("HOK Game Simulation — play Honor of Kings macro decisions | {site}"),
    description: message(
      "Play a whole Honor of Kings match as one hero on the map and take its macro decisions: where to go, when to fight, when to fall back. A grade at the end."
    )
  },
  ...CASINO_ROUTES,
  {
    pattern: /^\/popular(\/heroes)?$/,
    view: "popular",
    index: true,
    param: "section",
    title: message("HOK meta — most played and best Honor of Kings tournament drafts | {site}"),
    description: message(
      "The drafts and the heroes that win most and that are played most in Honor of Kings Global tournaments, for each side and each lane."
    ),
    sections: {
      "/heroes": {
        title: message(
          "HOK meta heroes — pick rate, ban rate and win rate in Honor of Kings tournaments | {site}"
        ),
        description: message(
          "The Honor of Kings Global heroes of the tournament meta, lane by lane: how often each one is picked and banned, and how often it wins."
        )
      }
    }
  },
  ...API_ROUTES,
  {
    pattern: /^\/space$/,
    view: "space",
    index: false,
    title: message("My space | {site}"),
    description: message("What you keep on the site, and the links that share it.")
  },
  {
    pattern: /^\/space\/shared$/,
    view: "space-shared",
    // indexable on purpose: the secret of a shared link sits after the # of the address, which a browser never sends, so
    // the server (and a search engine) only ever sees this one page, the same for everybody
    index: true,
    title: message("Shared space | {site}"),
    description: message("A space that somebody shared with you.")
  },
  {
    pattern: /^\/ratings$/,
    view: "ratings",
    index: false,
    title: message("Official ratings | {site}"),
    description: message("Rate the heroes of each lane, from SS to D.")
  },
  {
    pattern: /^\/guides$/,
    view: "guides",
    index: false,
    title: message("Hero guides | {site}"),
    description: message(
      "Write the recommended builds and the combos shown on the page of each hero."
    )
  },
  {
    pattern: /^\/guides\/([A-Za-z0-9_-]{1,80})$/,
    view: "guides",
    index: false,
    param: "guideHeroId",
    title: message("Hero guides | {site}"),
    description: message(
      "Write the recommended builds and the combos shown on the page of each hero."
    )
  },
  {
    pattern: /^\/reports$/,
    view: "reports",
    index: false,
    title: message("Reports | {site}"),
    description: message("Conversations reported by the community.")
  },
  {
    pattern: /^\/catalog$/,
    view: "catalog",
    index: false,
    title: message("Catalog | {site}"),
    description: message("The stats, tags, items and arcana of the game.")
  },
  {
    pattern: /^\/terms$/,
    view: "terms",
    index: true,
    title: message("Terms of use | {site}"),
    description: message("The rules for using HOK Global Scrim Lab.")
  },
  {
    pattern: /^\/privacy$/,
    view: "privacy",
    index: true,
    title: message("Privacy policy | {site}"),
    description: message(
      "What personal data HOK Global Scrim Lab keeps, why, for how long, and how to use your rights under the GDPR."
    )
  },
  {
    pattern: /^\/cookies$/,
    view: "cookies",
    index: true,
    title: message("Cookies and local storage | {site}"),
    description: message(
      "The cookies and the local storage HOK Global Scrim Lab uses, and what each is for."
    )
  },
  {
    pattern: /^\/legal$/,
    view: "legal",
    index: true,
    title: message("Legal notice | {site}"),
    description: message("Who publishes HOK Global Scrim Lab and who hosts it.")
  },
  {
    pattern: /^\/contact$/,
    view: "contact",
    index: true,
    title: message("Contact | {site}"),
    description: message("Write to the people behind HOK Global Scrim Lab.")
  },
  {
    pattern: /^\/login$/,
    view: "login",
    index: true,
    title: message("Sign in | {site}"),
    description: message("Sign in to your account.")
  },
  {
    pattern: /^\/login\/mfa$/,
    view: "mfa",
    index: true,
    title: message("Verification code | {site}"),
    description: message("Enter the code from your authenticator app.")
  },
  {
    pattern: /^\/login\/profile$/,
    view: "profile",
    index: true,
    title: message("Choose your pseudo | {site}"),
    description: message("Choose the pseudo and the password of your account.")
  },
  {
    pattern: /^\/login\/setup$/,
    view: "setup",
    index: true,
    title: message("Set up two-factor authentication | {site}"),
    description: message("Protect your account with an authenticator app.")
  },
  {
    pattern: /^\/register$/,
    view: "register",
    index: true,
    title: message("Create an account | {site}"),
    description: message("Create an account protected by two-factor authentication.")
  },
  {
    pattern: /^\/account$/,
    view: "account",
    index: true,
    title: message("Account security | {site}"),
    description: message("Password, authenticator and recovery codes.")
  }
];
