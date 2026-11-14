import { createHash } from "node:crypto";
import { badRequest } from "../../platform/errors.js";
import { integer, plainObject } from "../../platform/validation.js";

/**
 * The two kinds of things that can be shared: where they live, who they are shared with, and how an
 * invitation token starts.
 */
export const SHARE_KINDS = {
  series: {
    table: "series",
    members: "series_members",
    invites: "series_invites",
    fk: "series_id",
    prefix: "s"
  },
  tierList: {
    table: "tier_lists",
    members: "tier_list_members",
    invites: "tier_list_invites",
    fk: "tier_list_id",
    prefix: "t"
  }
};

/**
 * A view link of a tier list opens for everyone who receives it, for as long as the list exists (the
 * owner, 2026-11-14: people pass these links around). It is stored with this end date and never counts
 * its people; it can still be revoked. Edit links, and every link of a series, keep their end date and
 * their number of uses.
 */
export const isOpenLink = (kind, role) => kind === "tierList" && role === "viewer";
export const NEVER = Number.MAX_SAFE_INTEGER;

export const hashToken = token => createHash("sha256").update(token).digest("hex");

export function parseInviteRequest(body) {
  const input = plainObject(body ?? {});
  const role = input.role ?? "viewer";
  if (!["viewer", "editor"].includes(role)) {
    throw badRequest("role must be viewer or editor.", "invalid_body");
  }
  const days =
    input.expiresInDays === undefined
      ? 7
      : integer(input.expiresInDays, "expiresInDays", { min: 1, max: 30 });
  const maxUses =
    input.maxUses === undefined ? 1 : integer(input.maxUses, "maxUses", { min: 1, max: 20 });
  return { role, ttlMs: days * 24 * 60 * 60 * 1000, maxUses };
}
