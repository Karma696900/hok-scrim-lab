// Who can reach which route, frozen. Every route declared under server/features is called as a visitor, an
// ordinary person, a contributor and an administrator (src/testing/route-access.js), sorted into an access
// class, and compared with the table below, which was reviewed by hand (scripts/dev/route-matrix.mjs prints it
// with the statuses). A NEW ROUTE FAILS THIS TEST until it is classified here: that is the point. Choose the
// narrowest class that is true:
//   open        a visitor is not turned away (what it shows or does still follows the rules of the resource:
//               a series, a tier list, a team answer 404 to whoever may not see them)
//   login-flow  nobody gets in without the pending state of a sign-in, or a signature of Discord
//   account     a real account is needed
//   member      a role on the thing itself is needed (the owner of a team): an administrator is refused too
//   editor      an editor of what the site shows (an administrator or a contributor)
//   admin       an administrator only
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { accessMatrix, declaredRoutes } from "../testing/route-access.js";
import { startTestServer } from "../testing/test-app.js";

const EXPECTED = {
  "POST /admin/catalog/arcana": "admin",
  "DELETE /admin/catalog/arcana/:id": "admin",
  "PUT /admin/catalog/arcana/:id": "admin",
  "POST /admin/catalog/images": "admin",
  "POST /admin/catalog/items": "admin",
  "DELETE /admin/catalog/items/:id": "admin",
  "PUT /admin/catalog/items/:id": "admin",
  "POST /admin/catalog/items/bulk": "admin",
  "POST /admin/catalog/spells": "admin",
  "DELETE /admin/catalog/spells/:id": "admin",
  "PUT /admin/catalog/spells/:id": "admin",
  "POST /admin/catalog/stats": "admin",
  "DELETE /admin/catalog/stats/:id": "admin",
  "PUT /admin/catalog/stats/:id": "admin",
  "POST /admin/catalog/tags": "admin",
  "DELETE /admin/catalog/tags/:id": "admin",
  "PUT /admin/catalog/tags/:id": "admin",
  "POST /admin/catalog/tags/:id/merge": "admin",
  "PUT /admin/catalog/tag-groups": "admin",
  "GET /admin/competitive-imports": "admin",
  "POST /admin/competitive-imports": "admin",
  "DELETE /admin/competitive-imports/:id": "admin",
  "GET /admin/hero-details": "admin",
  "POST /admin/hero-details/sync": "admin",
  "POST /admin/heroes/:id/lanes": "admin",
  "DELETE /admin/heroes/:id/lanes/:lane": "admin",
  "GET /admin/heroes/:id/aliases": "admin",
  "POST /admin/heroes/:id/aliases": "admin",
  "DELETE /admin/heroes/:id/aliases/:key": "admin",
  "PUT /admin/heroes/:id/profile": "admin",
  "PUT /admin/players/:tag/labels": "admin",
  "GET /admin/contact": "admin",
  "PATCH /admin/contact/:id": "admin",
  "DELETE /admin/contact/:id": "admin",
  "GET /admin/reports": "admin",
  "DELETE /admin/reports/:id": "admin",
  "GET /admin/tournaments": "admin",
  "POST /admin/tournaments": "admin",
  "DELETE /admin/tournaments/:id": "admin",
  "GET /admin/tournaments/:id": "admin",
  "PUT /admin/tournaments/:id": "admin",
  "GET /admin/tournaments/suggestions": "admin",
  "DELETE /admin/translations/:hash/:language": "admin",
  "PUT /admin/translations/:hash/:language": "admin",
  "POST /admin/translations/:hash/keep": "admin",
  "POST /admin/translations/languages": "admin",
  "POST /admin/translations/retry": "admin",
  "GET /admin/translations/status": "admin",
  "POST /admin/translations/sweep": "admin",
  "GET /admin/translations/texts": "admin",
  "GET /api/auth/me": "open",
  "GET /auth/challenge": "open",
  "GET /auth/config": "open",
  "GET /auth/discord": "open",
  "GET /auth/discord/callback": "open",
  "GET /auth/google": "open",
  "GET /auth/google/callback": "open",
  "POST /auth/login": "login-flow",
  "POST /auth/logout": "open",
  "POST /auth/delete-account": "login-flow",
  "POST /auth/export": "login-flow",
  "POST /auth/logout-all": "account",
  "POST /contact": "open",
  "POST /auth/mfa/enrol/confirm": "login-flow",
  "POST /auth/mfa/enrol/start": "login-flow",
  "POST /auth/mfa/verify": "login-flow",
  "POST /auth/password": "account",
  "POST /auth/profile/complete": "login-flow",
  "POST /auth/recovery-codes": "login-flow",
  "POST /auth/register": "open",
  "GET /auth/security": "account",
  "GET /backgrounds": "open",
  "GET /builds": "editor",
  "DELETE /builds/:heroId/:variant": "editor",
  "PUT /builds/:heroId/:variant": "editor",
  "GET /catalog": "open",
  "GET /catalog/:family": "open",
  "GET /catalog/:family/:id": "open",
  "GET /combos": "editor",
  "POST /combos/:heroId": "editor",
  "DELETE /combos/:heroId/:id": "editor",
  "PUT /combos/:heroId/:id": "editor",
  "PUT /combos/:heroId/order": "editor",
  "GET /community/summary": "open",
  "GET /content-translations": "open",
  "POST /discord/interactions": "login-flow",
  "POST /events/:id/rsvp": "account",
  "POST /export/pdf": "account",
  "GET /health": "open",
  "GET /health/live": "open",
  "GET /heroes": "open",
  "GET /heroes/:id": "open",
  "GET /heroes/:id/scrims": "open",
  // the bots server only, with the shared secret: every person is refused (403), the class that says so is member
  "POST /internal/api-keys/verify": "member",
  "POST /internal/simulation/games": "member",
  "POST /invitations/:id/accept": "account",
  "POST /invitations/:id/decline": "account",
  "POST /invites/accept": "open",
  "GET /me/agenda": "account",
  "GET /me/api-keys": "account",
  "POST /me/api-keys": "account",
  "DELETE /me/api-keys/:id": "account",
  "DELETE /me/discord": "account",
  "GET /me/discord": "account",
  "POST /me/discord/test": "account",
  "PUT /me/discord/prefs": "account",
  "GET /me/invitations": "account",
  "PUT /me/player-profile": "account",
  "GET /me/preferences": "account",
  "PUT /me/preferences": "account",
  "GET /me/teams": "account",
  "GET /notifications": "account",
  "POST /notifications/read": "account",
  "GET /official-tiers": "editor",
  "PUT /official-tiers/:lane": "editor",
  "GET /tier-list": "open",
  "POST /online/:code/join": "account",
  "POST /online/series": "account",
  "GET /overview": "open",
  "GET /players/:tag": "open",
  "GET /popular/drafts": "open",
  "GET /popular/heroes": "open",
  "GET /profile": "account",
  "PATCH /profile": "account",
  "POST /profile/avatar": "account",
  "PUT /profile/avatar": "account",
  "GET /requests": "account",
  "POST /requests": "account",
  "GET /requests/:id": "account",
  "POST /requests/:id/messages": "account",
  "POST /requests/:id/report": "account",
  "POST /roster/sync": "admin",
  "GET /scrim-posts": "open",
  "POST /scrim-posts": "account",
  "DELETE /scrim-posts/:id": "account",
  "GET /series": "open",
  "POST /series": "open",
  "DELETE /series/:id": "open",
  "GET /series/:id": "open",
  "POST /series/:id/export": "account",
  "POST /series/:id/game": "open",
  "POST /series/:id/game/action": "open",
  "POST /series/:id/game/advance": "open",
  "POST /series/:id/game/complete": "open",
  "PATCH /series/:id/game/draft": "open",
  "POST /series/:id/game/ready": "open",
  "POST /series/:id/game/timer/:operation": "open",
  "PATCH /series/:id/games/:index": "open",
  "PATCH /series/:id/games/:index/draft": "open",
  "POST /series/:id/invites": "open",
  "DELETE /series/:id/invites/:invite": "open",
  "DELETE /series/:id/members/:userId": "open",
  "GET /series/:id/sharing": "open",
  "GET /series/:id/teams": "open",
  "DELETE /series/:id/teams/:teamId": "open",
  "PUT /series/:id/teams/:teamId": "open",
  "POST /series/import": "open",
  "POST /series/import-file": "open",
  "GET /space": "account",
  "POST /space/builds": "account",
  "DELETE /space/builds/:id": "account",
  "POST /space/links": "account",
  "DELETE /space/links/:id": "account",
  "POST /space/open": "open",
  "GET /stats/heroes": "open",
  "GET /stats/overview": "open",
  "GET /teams": "open",
  "POST /teams": "account",
  "DELETE /teams/:id": "member",
  "GET /teams/:id": "open",
  "PUT /teams/:id": "account",
  "POST /teams/:id/blocks": "account",
  "DELETE /teams/:id/discord": "account",
  "GET /teams/:id/discord": "account",
  "PUT /teams/:id/discord/channel": "account",
  "GET /teams/:id/events": "open",
  "POST /teams/:id/events": "account",
  "GET /teams/:id/events.ics": "account",
  "DELETE /teams/:id/events/:eventId": "account",
  "PUT /teams/:id/events/:eventId": "account",
  "POST /teams/:id/invitations": "account",
  "DELETE /teams/:id/invitations/:invitationId": "account",
  "DELETE /teams/:id/logo": "account",
  "PUT /teams/:id/logo": "account",
  "DELETE /teams/:id/members/:userId": "account",
  "PUT /teams/:id/members/:userId": "account",
  "GET /teams/:id/series": "open",
  "GET /teams/:id/training": "account",
  "POST /teams/:id/training/goals": "account",
  "DELETE /teams/:id/training/goals/:goalId": "account",
  "PUT /teams/:id/training/goals/:goalId": "account",
  "POST /teams/:id/training/hero-goals": "account",
  "DELETE /teams/:id/training/hero-goals/:goalId": "account",
  "GET /teams/:id/training/ranking": "account",
  "PUT /teams/:id/training/settings": "account",
  "GET /tier-lists": "open",
  "POST /tier-lists": "open",
  "DELETE /tier-lists/:id": "open",
  "GET /tier-lists/:id": "open",
  "PUT /tier-lists/:id": "open",
  "POST /tier-lists/:id/invites": "open",
  "DELETE /tier-lists/:id/invites/:invite": "open",
  "DELETE /tier-lists/:id/members/:userId": "open",
  "GET /tier-lists/:id/sharing": "open",
  "GET /tournaments": "account",
  "GET /tournaments/:id": "account",
  "GET /training/assigned": "account",
  "GET /training/combos": "account",
  "PUT /training/combos/:id": "account",
  "POST /training/combos/:id/review": "account",
  "GET /training/combos/review": "account",
  "GET /training/focus": "account",
  "PUT /training/focus": "account",
  "GET /training/maps": "open",
  "POST /training/maps": "admin",
  "DELETE /training/maps/:id": "admin",
  "GET /training/notes": "account",
  "POST /training/notes": "account",
  "DELETE /training/notes/:id": "account",
  "PUT /training/notes/:id": "account",
  "GET /training/reflex": "account",
  "POST /training/reflex/runs": "account",
  "GET /simulation/pool": "open",
  "POST /simulation/ticket": "account",
  "GET /simulation/games": "account",
  "GET /simulation/map": "open",
  "PUT /simulation/map": "admin",
  "GET /training/scenarios": "open",
  "POST /training/scenarios": "admin",
  "DELETE /training/scenarios/:id": "admin",
  "GET /training/scenarios/:id": "open",
  "PUT /training/scenarios/:id": "admin",
  "PUT /training/scenarios/:id/answer": "account"
};

describe("the table of access", () => {
  test("every declared route is classified, and the table keeps no route that is gone", () => {
    const declared = declaredRoutes().map(route => `${route.method} ${route.path}`);
    assert.deepEqual(
      declared.filter(key => !(key in EXPECTED)),
      [],
      "a new route: classify it in EXPECTED (and say why in the commit)"
    );
    assert.deepEqual(
      Object.keys(EXPECTED).filter(key => !declared.includes(key)),
      [],
      "a route that no longer exists: remove it from EXPECTED"
    );
  });

  test("the staff routes are never the open ones", () => {
    for (const [key, access] of Object.entries(EXPECTED)) {
      if (key.split(" ")[1].startsWith("/admin")) {
        assert.equal(access, "admin", `${key}: everything under /admin is for administrators`);
      }
    }
  });
});

const app = await startTestServer();
after(async () => {
  await app?.close();
});

describe(
  "what each kind of caller is told",
  { skip: app ? false : "MySQL is not reachable (docker compose up -d mysql)" },
  () => {
    test("every route answers as its class says (a visitor is refused what is not open, a person what is staff only)", async () => {
      const rows = await accessMatrix(app);
      const wrong = rows
        .filter(row => EXPECTED[`${row.method} ${row.path}`] !== row.access)
        .map(
          row =>
            `${row.method} ${row.path}: ${row.access} (visitor ${row.statuses.visitor}, person ${row.statuses.person}, contributor ${row.statuses.contributor}, admin ${row.statuses.admin}) instead of ${EXPECTED[`${row.method} ${row.path}`]}`
        );
      assert.deepEqual(wrong, []);
    });
  }
);
