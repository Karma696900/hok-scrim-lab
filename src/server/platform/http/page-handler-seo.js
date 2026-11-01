// What search engines and assistants read: structured data, robots.txt, the sitemap, llms.txt.
import { SITE_NAME, pathFor } from "../../../shared/routes.js";
import { safeJson } from "./first-paint.js";
import { escapeHtml } from "./page-handler-shared.js";
import { pieceUrls } from "./page-handler-pieces.js";
import { alternates } from "../../../shared/locale-path.js";

/**
 * The same page in every language (shared/locale-path.js), English as the default: in the head of a page
 * (`link`) and in the sitemap (`xhtml:link`).
 */
export function alternateLinks(base, path, tag = "link") {
  const link = (language, href) =>
    `<${tag} rel="alternate" hreflang="${language}" href="${escapeHtml(base + href)}"/>`;
  return [
    ...alternates(path).map(({ language, path: href }) => link(language, href)),
    link("x-default", path)
  ].join("");
}

/**
 * What a search engine reads about a page that may be indexed, as schema.org data in a JSON-LD block (a data block:
 * the browser never runs it, so the content policy has nothing to say about it). The home page says what the site is,
 * a hero sheet says what the page is about and where it sits.
 */
export function structuredData({ matched, info, base, language }) {
  if (!info.index || info.status !== 200) {
    return "";
  }
  let data = null;
  if (matched.view === "home") {
    data = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${base}/`,
      description: info.description,
      inLanguage: language
    };
  } else if (matched.view === "hero") {
    data = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: info.title,
      description: info.description,
      url: `${base}/heroes/${matched.heroId}`,
      inLanguage: language,
      ...(info.image ? { primaryImageOfPage: info.image } : {}),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${base}/` },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${base}/` },
          { "@type": "ListItem", position: 2, name: "Heroes", item: `${base}/heroes` },
          {
            "@type": "ListItem",
            position: 3,
            name: info.title,
            item: `${base}/heroes/${matched.heroId}`
          }
        ]
      }
    };
  }
  if (matched.view === "tier-list" && info.tierList) {
    return tierListData({ info, base, language });
  }
  if (!data && (COLLECTIONS.has(matched.view) || TOOLS.has(matched.view))) {
    data = pageData({ matched, info, base, language });
  }
  return data ? `<script type="application/ld+json">${safeJson(data)}</script>` : "";
}

/** Pages that list things (heroes, items...) and pages that are tools (the build lab, scrims, training). */
const COLLECTIONS = new Set(["heroes", "items", "arcana", "spells", "popular", "teams", "find"]);
const TOOLS = new Set(["build-lab", "scrims", "training", "tier-lists"]);

/** A list or a tool: what it is, and where it sits (the home, then the page). */
function pageData({ matched, info, base, language }) {
  const url = `${base}${pathFor({ view: matched.view, section: matched.section ?? "" })}`;
  const page = {
    "@context": "https://schema.org",
    "@type": TOOLS.has(matched.view) ? "WebApplication" : "CollectionPage",
    name: info.title,
    description: info.description,
    url,
    inLanguage: language,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${base}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${base}/` },
        { "@type": "ListItem", position: 2, name: info.title, item: url }
      ]
    }
  };
  return TOOLS.has(matched.view)
    ? {
        ...page,
        applicationCategory: "GameApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
      }
    : page;
}

/** The public tier list: the page (when it changed, where it sits) and its heroes as an ItemList. */
function tierListData({ info, base, language }) {
  const url = `${base}${info.tierList.path}`;
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: info.title,
    description: info.description,
    url,
    inLanguage: language,
    ...(info.tierList.updatedAt ? { dateModified: info.tierList.updatedAt } : {}),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${base}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Tier list", item: `${base}/tier-list` },
        ...(info.tierList.path === "/tier-list"
          ? []
          : [{ "@type": "ListItem", position: 3, name: info.title, item: url }])
      ]
    }
  };
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: info.title,
    url,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: info.tierList.items.length,
    itemListElement: info.tierList.items.map((hero, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: hero.name,
      url: `${base}/heroes/${hero.id}`
    }))
  };
  return [page, list]
    .map(data => `<script type="application/ld+json">${safeJson(data)}</script>`)
    .join("");
}

/** robots.txt, llms.txt and sitemap.xml: public pages only (the app, private data and accounts are excluded). */
export function createSeoHandlers({ store, config }) {
  const origin = request => config.appOrigin || `${request.protocol}://${request.get("host")}`;
  return {
    robots(request, response) {
      response
        .type("text/plain")
        .set("Cache-Control", "public, max-age=3600")
        .send(
          [
            "User-agent: *",
            "Allow: /",
            "Disallow: /api/",
            "Disallow: /auth/",
            "",
            `Sitemap: ${origin(request)}/sitemap.xml`,
            ""
          ].join("\n")
        );
    },
    /** A plain description of the site for language models that read it (llmstxt.org): what it is and where its public pages are. */
    llms(request, response) {
      const base = origin(request);
      response
        .type("text/plain")
        .set("Cache-Control", "public, max-age=3600")
        .send(
          [
            `# ${SITE_NAME}`,
            "",
            "> Free tools for Honor of Kings Global players and teams: scrim drafts with bans and picks, tier lists, hero guides with skills, videos and patch history, a build lab, game data (items, arcana, spells) and statistics of tournament drafts. Written for players; the data comes from the official game pages.",
            "",
            "## Public pages",
            `- [Heroes](${base}/heroes): every hero of the Global version with lane, class, skills, artwork and patch history`,
            `- [Tier list](${base}/tier-list): the heroes of every lane from SS to D, ranked by the tournament games of the last three months (one page per lane: ${base}/tier-list/clash, /jungle, /mid, /farm, /roam)`,
            `- [Tier list maker](${base}/tier-lists): make and share your own tier list`,
            `- [Build lab](${base}/build-lab): try a build, items and arcana with the computed stats`,
            `- [Items](${base}/items), [Arcana](${base}/arcana), [Spells](${base}/spells): the game data, one page per piece (${base}/items/<id>)`,
            `- [Popular drafts](${base}/popular) and [popular heroes](${base}/popular/heroes): what wins most in tournaments`,
            `- [Scrims](${base}/scrims): a free draft simulator with the competitive ban and pick, for scrim series`,
            `- [Training](${base}/training): combos, [reflex drills](${base}/training/reflex) and [map situations](${base}/training/scenarios)`,
            `- [Game Simulation](${base}/simulation): play a whole match as one hero and take its macro decisions, graded at the end`,
            `- [Teams](${base}/teams) and [find a scrim](${base}/find): team rosters and scrim announcements`,
            `- [HOK API](${base}/developers): read the heroes, items, arcana, spells, tier list and tournament drafts from a program or an AI assistant (read-only, with a free key)`,
            "",
            "## For machines",
            `- [Sitemap](${base}/sitemap.xml): every public address, one page per hero`,
            `- [OpenAPI description](${base}/api/v1/openapi.json): every address of the API (OpenAPI 3.1, no key needed to read it)`,
            `- [MCP server](${base}/api/v1/mcp): the same addresses as tools for an AI assistant (Streamable HTTP, bearer key)`,
            "",
            "## Not for indexing",
            "Accounts, the series of a team, history, the training notebook and the data of the API (/api/, read with a key) are private to their owners.",
            ""
          ].join("\n")
        );
    },
    async sitemap(request, response, next) {
      try {
        const base = origin(request);
        const heroes = (await store.readHeroes()).filter(hero => hero.availableGlobal !== false);
        const urls = [
          "/",
          "/heroes",
          "/tier-list",
          "/tier-list/clash",
          "/tier-list/jungle",
          "/tier-list/mid",
          "/tier-list/farm",
          "/tier-list/roam",
          "/tier-lists",
          "/items",
          "/arcana",
          "/spells",
          "/build-lab",
          "/scrims",
          "/training",
          "/training/reflex",
          "/training/scenarios",
          "/simulation",
          "/teams",
          "/find",
          "/popular",
          "/popular/heroes",
          "/developers",
          "/terms",
          "/privacy",
          "/cookies",
          "/legal",
          "/contact",
          ...heroes.map(hero => `/heroes/${hero.id}`),
          ...(await pieceUrls(store))
        ];
        response
          .type("application/xml")
          .set("Cache-Control", "public, max-age=3600")
          .send(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map(url => `  <url><loc>${escapeHtml(base + url)}</loc>${alternateLinks(base, url, "xhtml:link")}</url>`).join("\n")}\n</urlset>\n`
          );
      } catch (error) {
        next(error);
      }
    }
  };
}
