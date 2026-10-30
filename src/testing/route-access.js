// Who can reach which route. Every route declared under server/features is called as a visitor (no cookie),
// as an ordinary signed-in person, as a contributor (an editor of what the site shows) and as an
// administrator, on a throw-away database, and sorted into an access class from what each one was told.
// src/server/route-access.test.js freezes the reviewed classes; scripts/dev/route-matrix.mjs prints them.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../server/features");
/** The routes that are mounted at the root of the site, not under /api (sign-in with a provider, Discord's calls). */
const ROOT_ROUTES = new Set([
  "/auth/google",
  "/auth/google/callback",
  "/auth/discord",
  "/auth/discord/callback",
  "/auth/logout",
  "/discord/interactions"
]);
/** The address a route is called at. */
export const addressOf = route =>
  route.startsWith("/api/") || ROOT_ROUTES.has(route) ? route : `/api${route}`;

/** The two resources whose sharing routes are declared once, with the path as a parameter. */
const SHARED_PATHS = ["/series", "/tier-lists"];

/** Every route declared with a plain string path (or the sharing template): [{ method, path, file }]. */
export function declaredRoutes() {
  const found = [];
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) {
        walk(file);
      } else if (file.endsWith(".js")) {
        const text = readFileSync(file, "utf8");
        const relative = path.relative(ROOT, file).replaceAll("\\", "/");
        for (const match of text.matchAll(
          /\b(?:router|api)\.(get|post|put|patch|delete)\(\s*\n?\s*("(\/[^"]*)"|`(\$\{path\}[^`]*)`)/g
        )) {
          const method = match[1].toUpperCase();
          if (match[3]) {
            found.push({ method, path: match[3], file: relative });
          } else {
            for (const base of SHARED_PATHS) {
              found.push({ method, path: match[4].replace("${path}", base), file: relative });
            }
          }
        }
      }
    }
  };
  walk(ROOT);
  // the routes of the gateway itself are another door (a key, not a session): see api-keys.test.js
  return found
    .filter(route => !route.file.startsWith("api-keys/gateway"))
    .sort((left, right) =>
      `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`)
    );
}

const UUID = "11111111-2222-4333-8444-555555555555";
const SAMPLES = {
  id: UUID,
  teamId: UUID,
  userId: UUID,
  eventId: UUID,
  invitationId: UUID,
  goalId: UUID,
  tag: "ABC234",
  heroId: "h01",
  lane: "Clash%20Lane",
  index: "0",
  operation: "start",
  language: "fr",
  hash: "a".repeat(64),
  code: "ABCDEF",
  invite: "a".repeat(12),
  variant: "main"
};
/** The path with a believable value for each `:parameter`. */
export const withSamples = route =>
  route.replace(/:([A-Za-z]+)/g, (_match, name) => SAMPLES[name] ?? "x");

const refused = status => status === 401 || status === 403;

/**
 * The access class of a route from what each actor was answered:
 *   open        a visitor is not turned away (what it shows or does still follows the rules of the resource)
 *   login-flow  nobody gets in without the pending state of a sign-in (a password, a code)
 *   account     a real account is needed
 *   member      a role on the thing itself is needed (the owner of a team): an administrator is refused too
 *   editor      an editor of what the site shows (an administrator or a contributor)
 *   admin       an administrator only
 */
export function classify({ visitor, person, contributor, admin }) {
  if (!refused(visitor)) {
    return "open";
  }
  if (!refused(person)) {
    return "account";
  }
  if (visitor === 401 && person === 401 && admin === 401) {
    return "login-flow";
  }
  if (refused(admin)) {
    return "member";
  }
  return refused(contributor) ? "admin" : "editor";
}

/** Calls every route as each actor and returns [{ method, path, file, statuses, access }]. */
export async function accessMatrix(app) {
  // A route may close the sessions of the caller (logout-all, a password change): an actor signs in
  // again whenever the server no longer knows them, so that every route is called by who it says.
  const boss = await app.signIn("MatrixAdmin", { admin: true });
  const actors = {
    person: () => app.signIn("MatrixPerson"),
    admin: () => app.signIn("MatrixAdminToo", { admin: true }),
    contributor: async () => {
      const made = await app.signIn("MatrixContributor");
      await boss.browser.put(`/api/admin/players/${made.user.tag}/labels`, {
        labels: ["contributor"]
      });
      return made;
    }
  };
  const current = {};
  const browserOf = async name => {
    if (current[name] && (await current[name].browser.get("/api/auth/me")).body?.user) {
      return current[name].browser;
    }
    current[name] = await actors[name]();
    return current[name].browser;
  };
  const visitor = app.browser();
  const rows = [];
  for (const route of declaredRoutes()) {
    const url = addressOf(withSamples(route.path));
    const method = route.method.toLowerCase();
    const withBody = !["GET", "DELETE"].includes(route.method);
    const call = async who =>
      (withBody ? await who[method](url, {}) : await who[method](url)).status;
    const statuses = {
      visitor: await call(visitor),
      person: await call(await browserOf("person")),
      contributor: await call(await browserOf("contributor")),
      admin: await call(await browserOf("admin"))
    };
    rows.push({ ...route, statuses, access: classify(statuses) });
  }
  return rows;
}
