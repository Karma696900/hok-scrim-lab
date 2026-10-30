// The pages of the demonstration world a tour of the whole site visits.

/**
 * Every page of the application, each with the person who opens it (null: a visitor): what a tour of the whole
 * site visits (Lighthouse, the stored-markup check, the contrast and interaction tests). There is one entry for each
 * route of shared/routes.js, and one for each section of the pages that have some. `heroId` is a hero whose sheet
 * exists; the people are those of PEOPLE (captain of a team, administrator).
 */
export function demoPages(world, heroId) {
  const page = (name, route, who = null) => ({
    name,
    path: route,
    who,
    cookie: who ? `hok_session=${world.people[who].token}` : null
  });
  const { live, finished } = world.series;
  return [
    // a visitor
    page("home", "/"),
    page("heroes", "/heroes"),
    page("hero-sheet", `/heroes/${heroId}`),
    page("scrims", "/scrims"),
    page("tier-lists", "/tier-lists"),
    page("build-lab", "/build-lab"),
    page("items", "/items"),
    page("arcana", "/arcana"),
    page("spells", "/spells"),
    page("popular", "/popular"),
    page("popular-heroes", "/popular/heroes"),
    page("teams", "/teams"),
    page("find", "/find"),
    page("history", "/history"),
    page("login", "/login"),
    page("register", "/register"),
    page("login-mfa", "/login/mfa"),
    page("login-profile", "/login/profile"),
    page("login-setup", "/login/setup"),
    page("space-shared", "/space/shared"),
    page("not-found", "/nothing-here"),
    // the captain of a team
    page("home-captain", "/", "captain"),
    page("scrims-captain", "/scrims", "captain"),
    page("series-live", `/scrims/${live}`, "captain"),
    page("series-finished", `/scrims/${finished[0]}`, "captain"),
    page("live", "/live", "captain"),
    page("history-captain", "/history", "captain"),
    page("team", `/teams/${world.teams.fox}`, "captain"),
    page("agenda", "/agenda", "captain"),
    page("inbox", "/inbox", "captain"),
    page("discord", "/discord", "captain"),
    page("tier-lists-captain", "/tier-lists", "captain"),
    page("training", "/training", "captain"),
    page("training-notebook", "/training/notebook", "captain"),
    page("training-scenarios", "/training/scenarios", "captain"),
    page("training-reflex", "/training/reflex", "captain"),
    page("training-exercise", "/training/reflex/reaction", "captain"),
    page("space", "/space", "captain"),
    page("settings", "/settings", "captain"),
    page("account", "/account", "captain"),
    page("welcome", "/welcome", "captain"),
    page("player", `/players/${world.people.captain.tag}`, "captain"),
    // an administrator
    page("catalog", "/catalog", "admin"),
    page("tournaments", "/tournaments", "admin"),
    page("reports", "/reports", "admin"),
    page("guides", "/guides", "admin"),
    page("guides-hero", `/guides/${heroId}`, "admin"),
    page("ratings", "/ratings", "admin")
  ];
}
