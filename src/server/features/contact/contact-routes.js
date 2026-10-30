import { Router } from "express";
import { badRequest, notFound } from "../../platform/errors.js";
import { requireAdmin, wrap } from "../../platform/http/async.js";
import { UUID_PATTERN, plainObject, text } from "../../platform/validation.js";
import { cleanEmail } from "../auth/auth-service.js";

/** A message has line breaks, which `text` refuses (it is made for one line): the other control characters are dropped. */
function cleanMessage(value) {
  const message = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (message.length < 10 || message.length > 4000) {
    throw badRequest("The message must be between 10 and 4000 characters.", "invalid_message");
  }
  return message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** What the contact form sends: a name, an address to answer to, a subject and a message. */
export function parseContactMessage(body) {
  const input = plainObject(body);
  return {
    name: text(input.name, "Name", { min: 1, max: 80 }),
    email: cleanEmail(input.email),
    subject: text(input.subject, "Subject", { min: 1, max: 120 }),
    message: cleanMessage(input.message)
  };
}

/**
 * The contact page. Anybody may write (a limit per address, and a hidden field that only a program fills in), and an
 * administrator reads, marks as handled and deletes what was written.
 */
export function createContactRouter({ store, limiters }) {
  const router = Router();
  router.post(
    "/contact",
    limiters.contact,
    wrap(async request => {
      const message = parseContactMessage(request.body);
      // a program fills every field: it is told that it worked, and nothing is kept
      if (typeof request.body.website === "string" && request.body.website.trim()) {
        return { ok: true };
      }
      await store.addContactMessage({
        ...message,
        language: request.language,
        userId: request.user && !request.user.isGuest ? request.user.id : null
      });
      return { ok: true };
    })
  );
  router.get(
    "/admin/contact",
    wrap(async request => {
      requireAdmin(request);
      const limit = Math.min(Math.max(Number(request.query.pageSize) || 50, 1), 100);
      const offset = Math.max(Number(request.query.offset) || 0, 0);
      return store.listContactMessages({ limit, offset });
    })
  );
  router.patch(
    "/admin/contact/:id",
    limiters.write,
    wrap(async request => {
      requireAdmin(request);
      const { id } = request.params;
      const done =
        UUID_PATTERN.test(id) &&
        (await store.setContactHandled(id, request.body?.handled !== false));
      if (!done) {
        throw notFound("This message does not exist.");
      }
      return { ok: true };
    })
  );
  router.delete(
    "/admin/contact/:id",
    limiters.write,
    wrap(async request => {
      requireAdmin(request);
      const { id } = request.params;
      if (!UUID_PATTERN.test(id) || !(await store.deleteContactMessage(id))) {
        throw notFound("This message does not exist.");
      }
      return { ok: true };
    })
  );
  return router;
}
