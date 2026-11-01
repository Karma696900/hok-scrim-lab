// Design system guards: palette tokens, WCAG contrast, functional team colours, CSP-compatible
// markup.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { WEB } from "../server/platform/http/web-root.js";
import {
  SCRIPT,
  clientFeature,
  clientSource,
  clientStyles,
  filesUnder
} from "../testing/sources.js";

// Critical (inlined) and deferred stylesheets together: the design rules apply to both.
const css = clientStyles().replace(/\r\n/g, "\n");
const appJs = clientSource();
const logo = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");

const root = css.match(/:root \{([^}]*)\}/)[1];
const token = name => {
  const match = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `token --${name} must be a hex colour in :root`);
  return match[1].toLowerCase();
};

const channel = value => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = hex =>
  [1, 3, 5]
    .map(index => channel(parseInt(hex.slice(index, index + 2), 16)))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function lab(hex) {
  const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16)));
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b,
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => Math.hypot(...lab(a).map((value, index) => value - lab(b)[index]));

describe("palette", () => {
  test("the navy base colours of the reference boards are the specified ones", () => {
    assert.equal(token("canvas"), "#0a111a");
    assert.equal(token("panel"), "#0e1825");
    assert.equal(token("panel-raised"), "#15233a");
    assert.equal(token("ink"), "#e9eef8");
    assert.equal(token("brand"), "#5b9bff");
    assert.equal(token("brand-strong"), "#2f6fe8");
    assert.equal(token("team-blue"), "#2f6fe8");
    assert.equal(token("team-red"), "#cf3340");
  });

  const SURFACES = ["canvas", "panel", "panel-raised"];
  const TEXTS = [
    "ink",
    "muted",
    "faint",
    "brand-ink",
    "success",
    "warn",
    "danger",
    "team-blue-text",
    "team-red-text"
  ];
  const assertReadable = (name, valueOf) => {
    for (const text of TEXTS) {
      for (const surface of SURFACES) {
        const ratio = contrast(valueOf(text), valueOf(surface));
        assert.ok(ratio >= 4.5, `${name}: ${text} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  };

  test("every text colour reaches WCAG AA (4.5:1) on every surface, in the dark theme", () => {
    assertReadable("dark", token);
  });

  test("and in the light theme, which only moves the neutral and the state colours", () => {
    const lightTheme = css.match(/\[data-theme="light"\] \{([^}]*)\}/)[1];
    const lightToken = name => {
      const match = lightTheme.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
      return match ? match[1].toLowerCase() : token(name);
    };
    assertReadable("light", lightToken);
  });

  test("white on a button fill, an active tab or a side fill reaches AA", () => {
    for (const [label, background] of [
      ["the brand fill", token("brand-strong")],
      ["the blue side fill", token("team-blue")],
      ["the red side fill", token("team-red")]
    ]) {
      assert.ok(
        contrast("#ffffff", background) >= 4.5,
        `white on ${label}: ${contrast("#ffffff", background).toFixed(2)}`
      );
    }
  });

  test("the bright text blue is never a button fill under white text (it fails AA); fills use --brand-strong", () => {
    assert.ok(contrast("#ffffff", token("brand")) < 4.5);
    const fills = css
      .split("}")
      .filter(rule =>
        /background(?:-color)?:\s*(?:#5b9bff|var\(--brand\)|var\(--accent\))\s*(?:[;}]|$)/i.test(
          rule.split("{")[1] ?? ""
        )
      )
      .map(rule => rule.split("{")[0].trim());
    assert.deepEqual(
      fills.filter(
        // pseudo-elements, dots, bars and the mana drop are shapes without text
        selector =>
          !/::?(?:before|after)|dot|unread|avatar|bar|marker|fill|meter|tabs|mana/i.test(selector)
      ),
      []
    );
  });

  test("the two sides are clearly distinct from each other", () => {
    assert.ok(deltaE(token("team-blue"), token("team-red")) >= 50);
    assert.ok(deltaE(token("team-blue-text"), token("team-red-text")) >= 40);
  });

  test("the Blue Team colour is only used in team-context rules", () => {
    const offenders = css
      .split("}")
      .filter(rule => /var\(--team-blue(?:-text)?\)/.test(rule))
      .map(rule => rule.split("{")[0].trim())
      // the marks of a series take the colour of their side (.b), and the board of the simulation draws an ally,
      // a hero on the map and the farm of a side in theirs
      .filter(
        selector =>
          !/blue|team|side|donut|ring|legend|sim-ally|sim-dot|sim-bar--farm|\.b$/i.test(selector)
      );
    assert.deepEqual(offenders, []);
  });

  test("no colour of the previous identities is left (graphite Tactical Beacon, cyan Broadcast Arena, lime)", () => {
    assert.doesNotMatch(
      css,
      /--lime|#b2ec59|#c5f47b|#29d3ff|#2d6bff|#5b5bf0|#070d1f|#0d1630|#142046/i
    );
  });
});

describe("markup and assets", () => {
  test("the client never writes inline style attributes (CSP style-src 'self')", () => {
    assert.doesNotMatch(appJs, /\sstyle=["'`]/);
    assert.doesNotMatch(appJs, /setAttribute\(\s*["']style["']/);
  });

  test("hero videos show their frame at half a second (metadata preload + #t=0.5 fragment), never a blank box", () => {
    const videos = appJs.match(/<video[^>]*>/g) || [];
    assert.ok(videos.length >= 2);
    // The frame at 0.5 s (the owner asked for it: 1 s was already past the first move) is requested through the fragment; the file itself (several MB) is only
    // asked for when the video nears the screen.
    for (const tag of videos) {
      assert.match(tag, /data-src="[^"]*#t=0.5"/);
      assert.match(tag, /preload="none"/);
    }
    assert.match(appJs, /IntersectionObserver/);
    assert.match(appJs, /video.preload = "metadata"/);
  });

  test("no text is smaller than 12px (Lighthouse legibility, mobile readability)", () => {
    const small = [...css.matchAll(/font(?:-size)?:\s*(?:[a-z0-9-]+\s+){0,3}(\d+(?:\.\d+)?)px/g)]
      .filter(match => Number(match[1]) < 12)
      .map(match => match[0]);
    assert.deepEqual(small, []);
  });

  test("headings never skip a level (h4 and deeper are not used: sections are h2, their sub-blocks h3)", () => {
    for (const source of [
      clientSource({ only: /^main\.js$/ }),
      clientFeature("draft"),
      clientFeature("auth")
    ]) {
      assert.doesNotMatch(source, /<h[4-6][ >]/);
    }
  });

  test("a reduced-motion rule exists", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  test("the logo is a standalone SVG of the H mark: one gradient path, no external reference, small", () => {
    assert.match(logo, /<svg[^>]+viewBox="30 10 540 700"/);
    assert.equal((logo.match(/<linearGradient/g) || []).length, 1);
    assert.equal((logo.match(/<path/g) || []).length, 1);
    assert.ok(logo.length < 4000, `${logo.length} bytes`);
    assert.doesNotMatch(logo, /https?:\/\/(?!www\.w3\.org)|<script|<image|xlink:href|\sstyle=/);
  });
});

describe("shared form classes", () => {
  test("`.field` is defined once, globally: page-specific styles must be scoped (a second global rule once restyled every form)", async () => {
    const css = clientStyles();
    const globalRules = css.split("\n").filter(line => /^\.field\s*\{/.test(line));
    assert.equal(globalRules.length, 1, `found ${globalRules.length} global .field rules`);
  });
});

describe("the stylesheets hold together", () => {
  const stylesFolder = path.join(WEB.client, "styles");
  const sheets = filesUnder(stylesFolder, /\.css$/);
  const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "");

  /** The sheets that critical.css and main.css reach through @import, and the imports that point nowhere. */
  function reached() {
    const found = new Set();
    const broken = [];
    const visit = file => {
      if (found.has(file)) {
        return;
      }
      found.add(file);
      for (const match of withoutComments(readFileSync(file, "utf8")).matchAll(
        /@import\s+(?:url\()?["']([^"']+)["']/g
      )) {
        const target = path.join(path.dirname(file), match[1]);
        if (existsSync(target)) {
          visit(target);
        } else {
          broken.push(`${path.relative(stylesFolder, file)} imports ${match[1]}`);
        }
      }
    };
    visit(path.join(stylesFolder, "critical.css"));
    visit(path.join(stylesFolder, "main.css"));
    return { found, broken };
  }

  test("every import points at a file, and every stylesheet is imported by another", () => {
    const { found, broken } = reached();
    assert.deepEqual(broken, []);
    const orphans = sheets
      .filter(file => !found.has(file))
      .map(file => path.relative(stylesFolder, file));
    assert.deepEqual(orphans, []);
  });

  test("every custom property a rule reads is defined by a stylesheet or set by a script (or has a fallback)", () => {
    const defined = new Set();
    for (const file of sheets) {
      for (const match of withoutComments(readFileSync(file, "utf8")).matchAll(/(--[\w-]+)\s*:/g)) {
        defined.add(match[1]);
      }
    }
    for (const match of appJs.matchAll(/["'`](--[\w-]+)["'`]/g)) {
      defined.add(match[1]);
    }
    const missing = new Set();
    for (const file of sheets) {
      for (const match of withoutComments(readFileSync(file, "utf8")).matchAll(
        /var\(\s*(--[\w-]+)\s*([,)])/g
      )) {
        if (match[2] === ")" && !defined.has(match[1])) {
          missing.add(`${match[1]} (${path.relative(stylesFolder, file)})`);
        }
      }
    }
    assert.deepEqual([...missing], []);
  });

  test("every animation a rule starts has its @keyframes", () => {
    const text = sheets.map(file => withoutComments(readFileSync(file, "utf8"))).join("\n");
    const defined = new Set([...text.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]));
    const keywords =
      /^(none|infinite|both|forwards|backwards|alternate|alternate-reverse|reverse|normal|paused|running|initial|inherit|unset|ease|ease-in|ease-out|ease-in-out|linear|steps|jump-none|var)$/;
    const missing = new Set();
    for (const match of text.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
      for (const token of match[1].split(/[\s,]+/)) {
        if (/^[A-Za-z_-][\w-]*$/.test(token) && !keywords.test(token) && !defined.has(token)) {
          missing.add(token);
        }
      }
    }
    assert.deepEqual([...missing], []);
  });
});

// A rule written for a bare class (".slot-row { … }", not ".game-card .slot-row") reaches every element
// of the application that carries the class. That is how the tournaments page once turned the five
// bans of the draft board into boxes of no width.
describe("a rule for a bare class stays on its page", () => {
  const stylesFolder = path.join(WEB.client, "styles");
  const pagesFolder = path.join(stylesFolder, "pages");
  const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "");

  // the features of client/features whose markup each page stylesheet is written for
  const PAGE_FEATURES = {
    "account.css": ["auth"],
    "admin.css": ["community"],
    "agenda.css": ["community"],
    "auth.css": ["auth"],
    // the builds editor of the guides draws its pieces to pick from in the same box as the lab (.lb-catalog)
    "build-lab.css": ["build-lab", "guides"],
    "guides.css": ["guides"],
    "legal.css": ["legal"],
    "api.css": ["developers"],
    "popular.css": ["popular"],
    "ratings.css": ["ratings"],
    "tier-list-public.css": ["tier-list"],
    "reflex.css": ["training"],
    "space.css": ["space"],
    "catalog.css": ["catalog"],
    "community.css": ["community", "teams"],
    "discord.css": ["community", "teams"],
    "draft-editor.css": ["draft"],
    "draft.css": ["draft", "scrims"],
    "gamedata.css": ["gamedata"],
    "find.css": ["community"],
    "hero-builds.css": ["heroes"],
    "hero-editor.css": ["heroes"],
    "hero-sections.css": ["heroes"],
    "hero-sheet.css": ["heroes", "build-lab"],
    "hero-stats.css": ["heroes", "history"],
    "heroes.css": ["heroes"],
    "history.css": ["history", "heroes"],
    "home.css": ["home"],
    "inbox.css": ["community"],
    "not-found.css": ["app"],
    "player.css": ["community"],
    "scrims.css": ["scrims"],
    "series.css": ["scrims", "draft", "sharing"],
    "settings.css": ["settings"],
    "simulation.css": ["simulation"],
    "team.css": ["teams"],
    "teams.css": ["teams"],
    "tier-lists.css": ["tier-lists"],
    "tournaments.css": ["tournaments"],
    "training.css": ["training"],
    "welcome.css": ["settings"]
  };

  /** The rules outside every @media and @keyframes block. */
  function topLevelRules(css) {
    let depth = 0;
    let inAtRule = false;
    let rules = "";
    for (const char of withoutComments(css).replace(/@import[^;]*;/g, "")) {
      if (char === "@" && depth === 0) {
        inAtRule = true;
      }
      if (!inAtRule) {
        rules += char;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          inAtRule = false;
        }
      }
    }
    return rules;
  }

  /** The classes styled on their own: ".name", ".name:hover", ".name::before", not ".card .name". */
  function bareClasses(css) {
    const names = new Set();
    for (const match of css.matchAll(/([^{}]+)\{/g)) {
      for (const selector of match[1].split(",")) {
        const bare = selector.trim().match(/^\.([A-Za-z_][\w-]*)(?::{1,2}[\w-]+(?:\([^)]*\))?)*$/);
        if (bare) {
          names.add(bare[1]);
        }
      }
    }
    return names;
  }

  /**
   * A script with the code of its template expressions taken out, but for the texts in quotes: in
   * `class="btn ${active ? "on" : ""}"` the classes are btn and on, not active.
   */
  function withoutExpressions(source) {
    let text = source;
    for (let pass = 0; pass < 6; pass += 1) {
      const next = text.replace(
        /\$\{([^{}]*)\}/g,
        (_, code) =>
          ` ${[...code.matchAll(/["'`]([^"'`]*)["'`]/g)].map(found => found[1]).join(" ")} `
      );
      if (next === text) {
        break;
      }
      text = next;
    }
    return text;
  }

  /** The features of client/ that write each class, in class="…" and className = "…". */
  function classWriters() {
    const writers = new Map();
    for (const file of filesUnder(WEB.client, SCRIPT)) {
      const [folder, feature] = path.relative(WEB.client, file).split(path.sep);
      const owner = folder === "features" ? feature : folder.replace(/\.js$/, "");
      for (const attribute of withoutExpressions(readFileSync(file, "utf8")).matchAll(
        /class(?:Name)?\s*=\s*\\?["'`]([^"'`]*)["'`]/g
      )) {
        for (const name of attribute[1].split(/\s+/)) {
          writers.set(name, (writers.get(name) ?? new Set()).add(owner));
        }
      }
    }
    return writers;
  }

  test("a class has its base rule in one stylesheet only (the second would override the first)", () => {
    // the parts of a long stylesheet (reflex.css, reflex-bar.css…) count as one sheet: they are one cascade
    const all = filesUnder(stylesFolder, /\.css$/);
    const familyOf = file => {
      const stem = path.basename(file, ".css");
      const parent = all
        .filter(other => path.dirname(other) === path.dirname(file) && other !== file)
        .map(other => path.basename(other, ".css"))
        .filter(other => stem.startsWith(`${other}-`))
        .sort((x, y) => y.length - x.length)[0];
      return parent ? path.join(path.dirname(file), `${parent}.css`) : file;
    };
    const sheetsOf = new Map();
    for (const file of all) {
      for (const name of bareClasses(topLevelRules(readFileSync(file, "utf8")))) {
        const sheet = path.relative(stylesFolder, familyOf(file));
        const known = sheetsOf.get(name) ?? [];
        sheetsOf.set(name, known.includes(sheet) ? known : [...known, sheet]);
      }
    }
    const twice = [...sheetsOf]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => `.${name}: ${files.join(", ")}`);
    assert.deepEqual(twice, []);
  });

  // A long page stylesheet is cut into parts named after it (hero-sheet.css, hero-sheet-scrims.css): a part is for the features of its family.
  const featuresOf = page =>
    PAGE_FEATURES[page] ??
    PAGE_FEATURES[
      Object.keys(PAGE_FEATURES)
        .filter(family => page.startsWith(`${family.replace(/.css$/, "")}-`))
        .sort((a, b) => b.length - a.length)[0]
    ];

  test("a page stylesheet only styles bare classes that the features of its page write", () => {
    const pages = filesUnder(pagesFolder, /\.css$/).map(file => path.basename(file));
    assert.deepEqual(
      pages.filter(page => !featuresOf(page)),
      [],
      "a page stylesheet is listed in PAGE_FEATURES with the features it is for"
    );
    assert.deepEqual(
      Object.keys(PAGE_FEATURES).filter(page => !pages.includes(page)),
      [],
      "PAGE_FEATURES lists no stylesheet that does not exist"
    );
    const writers = classWriters();
    const leaks = [];
    for (const page of pages) {
      const css = withoutComments(readFileSync(path.join(pagesFolder, page), "utf8"));
      for (const name of bareClasses(css)) {
        const others = [...(writers.get(name) ?? [])].filter(
          feature => !featuresOf(page).includes(feature)
        );
        if (others.length) {
          leaks.push(`${page}: .${name} is also written by ${others.join(", ")}`);
        }
      }
    }
    assert.deepEqual(
      leaks,
      [],
      "scope the rule (.parent .name) or move it to components/ when two pages share the class"
    );
  });
});
