import { randomUUID } from "node:crypto";
import { bindTo } from "../../../shared/bind-to.js";
import { onView as requestsStoreCreateRequest } from "./requests-store-create-request.js";
import { onView as requestsStoreAnswerRequest } from "./requests-store-answer-request.js";

/** Scrim requests between two teams: the conversation, the counter-proposals, blocking and reporting. */
export function createRequestsStore({ pool, inTransaction }) {
  const ctx = { inTransaction, pool };
  bindTo(ctx, requestsStoreCreateRequest, requestsStoreAnswerRequest);

  return {
    createRequest: ctx.createRequest,

    listRequests: ctx.listRequests,

    getRequest: ctx.getRequest,

    addMessage: ctx.addMessage,

    answerRequest: ctx.answerRequest,

    blockTeam: ctx.blockTeam,

    async report(userId, requestId, reason) {
      if (requestId) {
        await this.getRequest(requestId, userId);
      }
      await ctx.pool.execute(
        "INSERT INTO reports (id, reporter_id, request_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), userId, requestId, reason, Date.now()]
      );
    },

    listReports: ctx.listReports,

    dismissReport: ctx.dismissReport
  };
}
