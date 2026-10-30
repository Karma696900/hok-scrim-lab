// An item is sorted two ways: the slot it goes in (`category`: boots, regular, utility, late; what a
// build has room for) and now the category it is found under in the shop of the game (Physical,
// Magical, Defense, Movement, Jungling, Roaming). One at most, NULL until an administrator chooses.
// Additive only: an item written before keeps everything it had.
import { addColumnIfMissing } from "./helpers.js";

export default {
  version: 28,
  name: "item-shop-category",
  async up(connection) {
    await addColumnIfMissing(connection, "catalog_items", "shop_category", "VARCHAR(12) NULL");
  }
};
