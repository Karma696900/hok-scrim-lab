// The pages of the composition roulette, part of the table of the pages (routes-table.js): the landing, public and
// indexed, and one roulette, shared by its link and never indexed (spec 2026-11-07 casino).
import { message } from "./routes-shared.js";

export const CASINO_ROUTES = [
  {
    pattern: /^\/casino$/,
    view: "casino",
    index: true,
    title: message("HOK composition roulette — random Honor of Kings team per lane | {site}"),
    description: message(
      "Spin a random Honor of Kings composition, one hero per lane from the pools you choose, respin a lane when a hero is banned, and share the live link."
    )
  },
  {
    // one roulette, shared by its link: never indexed (spec 2026-11-07 casino)
    pattern: /^\/casino\/([A-Za-z0-9]{10})$/,
    view: "casino-roll",
    index: false,
    param: "casinoId",
    title: message("Composition roulette | {site}"),
    description: message("A live Honor of Kings composition roulette.")
  }
];
