// The composition roulette's API (spec 2026-11-07 casino). No account and no cookie: anyone creates a roulette and
// gets its secret key once; everyone reads it by its id; only the key changes it (sent in `X-Casino-Key`, kept on the
// server as a SHA-256). The server draws, so everyone sees the same result. A change read from a version that moved
// in between is redone once from the new one (two control devices at once), else 409.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { HttpError, conflict, forbidden, notFound } from "../../platform/errors.js";
import { wrap } from "../../platform/http/async.js";
import {
  banLane,
  defaultPools,
  draw,
  emptyState,
  parseLanes,
  parsePools,
  unban
} from "./casino-domain.js";
import { laneIconAssets, parseBasket, renderBasketHtml } from "./casino-report.js";

const ID_PATTERN = /^[A-Za-z0-9]{10}$/;
const ID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const newId = () =>
  Array.from({ length: 10 }, () => ID_LETTERS[randomInt(ID_LETTERS.length)]).join("");
const hashKey = key => createHash("sha256").update(key).digest("hex");
const pick = n => randomInt(n);

/** What everyone may read of a roulette: never its key nor its hash. */
const present = roll => ({ id: roll.id, version: roll.version, ...roll.state });

const missing = () => notFound("This roulette does not exist.");

function keyMatches(roll, key) {
  if (typeof key !== "string" || !key) {
    return false;
  }
  const given = Buffer.from(hashKey(key), "hex");
  const kept = Buffer.from(roll.keyHash, "hex");
  return given.length === kept.length && timingSafeEqual(given, kept);
}

// POST /casino/pdf: the basket, checked against the heroes the site knows, drawn by the series export engine
function basketPdf(exportService, known) {
  return async (request, response) => {
    if (!exportService?.renderDocument) {
      throw new HttpError(503, "export_unavailable", "Export is not available on this server.");
    }
    const { ids } = await known();
    const compositions = parseBasket(request.body, ids);
    const heroIds = compositions.flatMap(item => Object.values(item.result)).filter(Boolean);
    const language = request.language;
    const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const pdf = await exportService.renderDocument(
      `casino:${request.ip}`,
      heroIds,
      async ({ heroById, portraitPath }) => ({
        html: renderBasketHtml({ compositions, heroById, portraitPath, generatedAt, language }),
        assets: await laneIconAssets()
      }),
      { language }
    );
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hok-compositions-${generatedAt.slice(0, 10)}.pdf"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store"
    });
    response.end(pdf);
  };
}

export function createCasinoRouter({ store, limiters, exportService = null }) {
  const router = Router();

  const known = async () => {
    const heroes = await store.readHeroes();
    return { heroes, ids: new Set(heroes.map(hero => hero.id)) };
  };

  async function readOr404(id) {
    const roll = ID_PATTERN.test(id) ? await store.readCasino(id) : null;
    if (!roll) {
      throw missing();
    }
    return roll;
  }

  // reads the roulette, checks the key, applies `change(state, ids)` and saves it from the version read (once more
  // from the new version when another change landed in between)
  async function change(request, apply) {
    let roll = await readOr404(request.params.id);
    if (!keyMatches(roll, request.get("X-Casino-Key"))) {
      throw forbidden("This control link is not valid.", "casino_key");
    }
    const { ids } = await known();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const next = apply(roll.state, ids);
      if (await store.updateCasino(roll.id, roll.version, next)) {
        return present({ ...roll, version: roll.version + 1, state: next });
      }
      roll = await readOr404(roll.id);
    }
    throw conflict("The roulette changed at the same time. Try again.", "casino_busy");
  }

  router.post(
    "/casino",
    limiters.casinoCreate,
    wrap(async (request, response) => {
      const { heroes, ids } = await known();
      const pools =
        request.body?.pools === undefined ? defaultPools(heroes) : parsePools(request.body, ids);
      const id = newId();
      const key = randomBytes(32).toString("base64url");
      const state = emptyState(pools);
      await store.createCasino({ id, keyHash: hashKey(key), state });
      response.status(201).json({ id, key, state: present({ id, version: 0, state }) });
    })
  );

  // the basket (owner, 2026-11-07): the compositions a visitor kept, in one PDF; no account, the export limit
  router.post("/casino/pdf", limiters.export, wrap(basketPdf(exportService, known)));

  router.get(
    "/casino/:id",
    limiters.media,
    wrap(async (request, response) => {
      const roll = await readOr404(request.params.id);
      const since = request.query.since;
      if (typeof since === "string" && since !== "" && Number(since) === roll.version) {
        response.status(304).end();
        return undefined;
      }
      response.set("Cache-Control", "no-store");
      return present(roll);
    })
  );

  router.put(
    "/casino/:id/pools",
    limiters.casinoAction,
    wrap(request =>
      change(request, (state, ids) => ({ ...state, pools: parsePools(request.body, ids) }))
    )
  );

  router.post(
    "/casino/:id/spin",
    limiters.casinoAction,
    wrap(request => {
      const lanes = parseLanes(request.body);
      return change(request, (state, ids) =>
        draw(state, lanes, {
          known: ids,
          pick,
          now: Date.now(),
          kind: lanes.length === 5 ? "spin" : "respin"
        })
      );
    })
  );

  router.post(
    "/casino/:id/ban",
    limiters.casinoAction,
    wrap(request =>
      change(request, (state, ids) =>
        banLane(state, request.body?.lane, { known: ids, pick, now: Date.now() })
      )
    )
  );

  router.delete(
    "/casino/:id/ban/:heroId",
    limiters.casinoAction,
    wrap(request => change(request, state => unban(state, request.params.heroId)))
  );

  return router;
}
