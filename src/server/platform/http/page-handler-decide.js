// What a page is, before anything is written: the facts about the address, who asks, and whether the server draws the
// first screen itself (a page for a visitor, or the frame of a page for a person who is signed in).
import { matchRoute } from "../../../shared/routes.js";
import { PRERENDER_HEADER } from "./prerender.js";
import {
  FRAME_VIEWS,
  ROOM_FRAME_PATH,
  SESSION_COOKIE,
  SSR_VIEWS,
  TRAINING_PATHS,
  VISITOR_FRAME_VIEWS
} from "./page-handler-views.js";

export async function decidePage(ctx, request, language, { prerender, bootstrap }) {
  // a person who is signed in: their session, preferences and menu counters go into the page (bootstrap.js)
  const [info, session] = await Promise.all([
    ctx.describe(request, language),
    request.user && bootstrap ? bootstrap(request) : null
  ]);
  const matched = matchRoute(request.path);
  // The first screen already drawn, for visitors with no session (see
  // platform/http/prerender.js). Everything else gets the plain shell.
  const renderable =
    prerender &&
    info.status === 200 &&
    SSR_VIEWS.has(matched.view) &&
    !(matched.view === "scrims" && matched.seriesId) &&
    !/[?&](join|invite|next)=/.test(request.originalUrl) &&
    request.headers[PRERENDER_HEADER] !== prerender.token &&
    !SESSION_COOKIE.test(request.headers.cookie ?? "");
  // a series whose game is in its draft, opened by a person who can see it: its frame is the room of the draft
  const inRoom =
    Boolean(prerender) &&
    Boolean(session?.me?.user) &&
    info.status === 200 &&
    (matched.view === "live" || (matched.view === "scrims" && Boolean(matched.seriesId))) &&
    !/[?&](join|invite|next)=/.test(request.originalUrl) &&
    request.headers[PRERENDER_HEADER] !== prerender.token &&
    (await ctx.draftInProgress(request.user.id, matched));
  // the frame of the guides is the one of the page with no hero open (the hero is chosen once the page is there)
  const wanted = inRoom
    ? ROOM_FRAME_PATH
    : matched.view === "guides"
      ? "/guides"
      : request.path.replace(/\/+$/, "") || "/";
  // A person who is signed in: the frame of the view (what every such person sees first), by their kind.
  const frameable =
    prerender &&
    session?.me?.user &&
    info.status === 200 &&
    (inRoom || FRAME_VIEWS.has(matched.view)) &&
    (matched.view !== "training" || TRAINING_PATHS.includes(wanted)) &&
    (inRoom || !(matched.view === "scrims" && matched.seriesId)) &&
    !/[?&](join|invite|next)=/.test(request.originalUrl) &&
    request.headers[PRERENDER_HEADER] !== prerender.token;
  // a visitor with no session, on a page that waits for what its link carries
  const visitorFrameable =
    prerender &&
    !request.user &&
    !SESSION_COOKIE.test(request.headers.cookie ?? "") &&
    info.status === 200 &&
    VISITOR_FRAME_VIEWS.has(matched.view) &&
    request.headers[PRERENDER_HEADER] !== prerender.token;
  const isFrame = !renderable && Boolean(frameable || visitorFrameable);
  const drawn = renderable
    ? await prerender.get(wanted, language)
    : frameable
      ? await prerender.get(wanted, language, {
          variant: !inRoom && (request.user.isAdmin || request.user.isEditor) ? "staff" : "user"
        })
      : visitorFrameable
        ? await prerender.get(wanted, language, { variant: "visitor" })
        : null;
  return { info, session, matched, inRoom, isFrame, drawn };
}
