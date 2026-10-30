// combo routes, training: registerTrainingRoutes.
import { REVIEW_SHOWN, TO_LEARN_SHOWN } from "../../../shared/combo-model.js";
import { TRAINEE_ROLES } from "../reflex/reflex-domain.js";
import { notFound } from "../../platform/errors.js";
import { parseProgress, parseReviewAnswer } from "./combo-domain.js";
import { parseUuid } from "../../platform/validation.js";
import { wrap } from "../../platform/http/async.js";
import { player } from "./combo-routes-parts.js";

export function registerTrainingRoutes(ctx) {
  /**
   * What to work on today: the combos that are acquired and whose day to be checked has come, and some
   * that are not acquired yet, among the heroes the player works on and the ones their teams ask for.
   * The skills of the heroes that appear come with them (a name and a picture each), so that the page
   * does not have to fetch a whole hero sheet for each.
   */
  ctx.router.get(
    "/training/combos/review",
    wrap(async request => {
      const user = player(request);
      const now = Date.now();
      const asked = [];
      for (const team of await ctx.store.teamsOfUser(user.id)) {
        if (TRAINEE_ROLES.includes(team.myRole)) {
          asked.push(...(await ctx.store.listHeroGoals(team.id)).map(goal => goal.heroId));
        }
      }
      const heroIds = [...new Set([...asked, ...(await ctx.store.getTrainingFocus(user.id))])];
      const [due, toLearn] = await Promise.all([
        ctx.store.dueReviews(user.id, now, REVIEW_SHOWN),
        ctx.store.combosToLearn(user.id, heroIds, TO_LEARN_SHOWN)
      ]);
      const language = request.language ?? "en";
      const skills = {};
      for (const heroId of new Set([...due.combos, ...toLearn.combos].map(combo => combo.heroId))) {
        const stored =
          (language === "en" ? null : await ctx.store.getHeroDetails(heroId, language)) ??
          (await ctx.store.getHeroDetails(heroId, "en"));
        skills[heroId] = (stored?.details?.skills ?? [])
          .filter(skill => skill.id)
          .map(skill => ({ id: skill.id, name: skill.name, icon: skill.icon ?? null }));
      }
      return {
        now,
        due: due.combos,
        dueTotal: due.total,
        toLearn: toLearn.combos,
        toLearnTotal: toLearn.total,
        skills
      };
    })
  );
  ctx.router.post(
    "/training/combos/:id/review",
    ctx.limiters.write,
    wrap(async request => {
      const user = player(request);
      const id = parseUuid(request.params.id, "combo id");
      const sharp = parseReviewAnswer(request.body);
      const next = await ctx.store.answerReview(user.id, id, sharp, Date.now());
      if (!next) {
        throw notFound("This combo is not in your schedule.");
      }
      return next;
    })
  );
  ctx.router.put(
    "/training/combos/:id",
    ctx.limiters.write,
    wrap(async request => {
      const user = player(request);
      const id = parseUuid(request.params.id, "combo id");
      const progress = parseProgress(request.body);
      if (!(await ctx.store.comboExists(id))) {
        throw notFound("Combo not found.");
      }
      return ctx.store.setComboProgress(user.id, id, progress);
    })
  );
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = { registerTrainingRoutes };
