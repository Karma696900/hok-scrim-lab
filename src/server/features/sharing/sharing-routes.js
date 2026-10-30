import { notFound } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import { parseInviteRequest } from "./sharing-domain.js";
import { parseUuid, plainObject } from "../../platform/validation.js";

/** Owner-only sharing endpoints, identical for series and tier lists. */
export function registerSharingRoutes(router, { store, kind, path, limiters }) {
  const ownerId = request => request.user?.id ?? null;
  const requireOwner = request => {
    const id = ownerId(request);
    if (!id) {
      throw notFound("Not found.");
    }
    return id;
  };

  router.get(
    `${path}/:id/sharing`,
    wrap(request => store.listSharing(kind, parseUuid(request.params.id), requireOwner(request)))
  );

  router.post(
    `${path}/:id/invites`,
    limiters.share,
    wrap(async request => {
      const invite = await store.createInvite(
        kind,
        parseUuid(request.params.id),
        requireOwner(request),
        parseInviteRequest(request.body)
      );
      // The token is only ever shown here; the database keeps its hash.
      return {
        token: invite.token,
        role: invite.role,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        link: `/?invite=${encodeURIComponent(invite.token)}`
      };
    })
  );

  router.delete(
    `${path}/:id/invites/:invite`,
    wrap(async request => {
      if (!/^[0-9a-f]{12}$/.test(request.params.invite)) {
        throw notFound("Invitation not found.");
      }
      if (
        !(await store.revokeInvite(
          kind,
          parseUuid(request.params.id),
          requireOwner(request),
          request.params.invite
        ))
      ) {
        throw notFound("Invitation not found.");
      }
      return { revoked: true };
    })
  );

  router.delete(
    `${path}/:id/members/:userId`,
    wrap(async request => {
      const requester = ownerId(request);
      if (!requester) {
        throw notFound("Not found.");
      }
      const target =
        request.params.userId === "me" ? requester : parseUuid(request.params.userId, "user id");
      if (!(await store.removeMember(kind, parseUuid(request.params.id), requester, target))) {
        throw notFound("Member not found.");
      }
      return { removed: true };
    })
  );
}

export function registerInviteAcceptance(router, { store, identity, limiters }) {
  router.post(
    "/invites/accept",
    limiters.join,
    wrap(async (request, response) => {
      const body = plainObject(request.body);
      if (typeof body.token !== "string" || body.token.length > 80) {
        throw notFound("This invitation is not valid.");
      }
      const user = await identity.ensureUser(request, response);
      return store.acceptInvite(body.token, user.id);
    })
  );
}
