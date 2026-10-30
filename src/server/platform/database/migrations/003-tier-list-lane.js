import { addColumnIfMissing, addIndexIfMissing } from "./helpers.js";

// Tier lists get a lane (NULL = "All Roles"). Existing rows stay NULL, so every old tier list is an
// All Roles list, unchanged. The JSON blob stays the source of truth; the column only exists so the
// server can filter.
export default {
  version: 3,
  name: "tier-list-lane",
  async up(connection) {
    await addColumnIfMissing(connection, "tier_lists", "lane", "VARCHAR(20) NULL");
    await addIndexIfMissing(
      connection,
      "tier_lists",
      "idx_tier_lists_lane",
      "INDEX idx_tier_lists_lane (lane)"
    );
  }
};
