// What search engines and assistants read: structured data, robots.txt, the sitemap, llms.txt.
import { SITE_NAME } from "../../../shared/routes.js";
import { safeJson } from "./first-paint.js";
import { escapeHtml } from "./page-handler-shared.js";

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
  return data ? `<script type="application/ld+json">${safeJson(data)}</script>` : "";
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
            `- [Tier lists](${base}/tier-lists): rankings of the heroes per lane`,
            `- [Build lab](${base}/build-lab): try a build, items and arcana with the computed stats`,
            `- [Items](${base}/items), [Arcana](${base}/arcana), [Spells](${base}/spells): the game data`,
            `- [Popular drafts](${base}/popular) and [popular heroes](${base}/popular/heroes): what wins most in tournaments`,
            "",
            "## For machines",
            `- [Sitemap](${base}/sitemap.xml): every public address, one page per hero`,
            "",
            "## Not for indexing",
            "Accounts, teams, scrims, history, training and the API (/api/) are private to their owners.",
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
          "/tier-lists",
          "/items",
          "/arcana",
          "/spells",
          "/build-lab",
          "/popular",
          "/popular/heroes",
          "/terms",
          "/privacy",
          "/cookies",
          "/legal",
          "/contact",
          ...heroes.map(hero => `/heroes/${hero.id}`)
        ];
        response
          .type("application/xml")
          .set("Cache-Control", "public, max-age=3600")
          .send(
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escapeHtml(base + url)}</loc></url>`).join("\n")}\n</urlset>\n`
          );
      } catch (error) {
        next(error);
      }
    }
  };
}
