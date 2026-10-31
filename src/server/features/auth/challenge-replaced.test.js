// A sign-in replaced by another sign-in of the same account while its code is being checked (one open
// challenge per account): the challenge is found, then gone when the try is counted. That is an expired
// sign-in (401), not "too many wrong codes" (429). Two sign-ins at the same time made the parallel test
// of auth.test.js fail now and then on this.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { enrolConfirm, verifySecondFactor } from "./auth-service-enrol-start.js";

/** A context whose challenge is found, but deleted before its try is counted. */
function replacedMeanwhile(kind) {
  const cleared = [];
  const ctx = {
    currentChallenge: async () => ({
      challenge: { kind, user_id: 1, pending_secret_enc: "x", method: "password" },
      tokenHash: "h"
    }),
    store: {
      getAuthUser: async () => ({ id: 1, locked_until: 0 }),
      bumpChallengeAttempts: async () => null,
      deleteChallenge: async () => assert.fail("nothing is left to delete"),
      recordLoginFailure: async () => assert.fail("a replaced sign-in is no failure of the account")
    },
    event: async () => {},
    identity: {
      names: { challenge: "hok_challenge" },
      clearCookie: (_response, name) => cleared.push(name)
    }
  };
  return { ctx, cleared };
}

describe("a sign-in replaced while its code is checked", () => {
  for (const [label, run, kind] of [
    ["the second factor", ctx => verifySecondFactor(ctx, {}, {}, { code: "123456" }), "mfa"],
    ["the enrolment", ctx => enrolConfirm(ctx, {}, {}, { code: "123456" }), "enroll"]
  ]) {
    test(`${label}: expired, start again (401), and its cookie is cleared`, async () => {
      const { ctx, cleared } = replacedMeanwhile(kind);
      await assert.rejects(
        run(ctx),
        error => error.status === 401 && error.code === "challenge_expired"
      );
      assert.deepEqual(cleared, ["hok_challenge"]);
    });
  }
});
