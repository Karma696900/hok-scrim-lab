// The ways in: the sign-in routes of the account, the link with a Discord account and the Discord bot of a team, Google.
import { createAuthService } from "./features/auth/auth-service.js";
import { createGoogleAuthRouter } from "./features/auth/google.js";
import { createDiscordLinkRouter } from "./features/community/community-routes.js";
import { createTeamDiscordRouter } from "./features/discord/discord-routes.js";

/** Mounts them on the application and returns what the API router needs of them. */
export function mountSignIn(
  app,
  { store, config, logger, secretBox, identity, limiters, discord, notifier }
) {
  const auth = createAuthService({ store: store, config: config, identity, secretBox });
  const teamDiscord = createTeamDiscordRouter({
    store: store,
    discord,
    notifier,
    limiters,
    identity,
    limiter: limiters.auth
  });
  app.use(teamDiscord.browser);
  app.use(
    createDiscordLinkRouter({
      store: store,
      discord,
      identity,
      limiter: limiters.auth,
      logger: logger
    })
  );
  app.use(
    createGoogleAuthRouter({
      store: store,
      config: config,
      identity,
      limiter: limiters.auth,
      logger: logger,
      auth
    })
  );

  return { auth, teamDiscord };
}
