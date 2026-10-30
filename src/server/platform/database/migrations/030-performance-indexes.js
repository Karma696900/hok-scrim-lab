// Two indexes that scripts/performance/api-probe.mjs found missing once the tables hold thousands of rows
// (EXPLAIN on 20 000 events and 8 000 scrim requests). Additive only: no column, no row is touched.
//
//  - team_events(starts_at): the reminder loop runs every minute and asks "which events start in the next
//    six hours" across ALL teams. The only index began with team_id, so each run read the whole table
//    (20 311 rows) and, because the query ends in FOR UPDATE, locked every row it read. With this index it
//    reads the 88 events of the window.
//  - scrim_requests(awaiting_team_id, status): the menu badge "requests waiting for your answer" is
//    counted on every page load; it read every request of the site (8 383 rows) and now reads 13.
import { addIndexIfMissing } from "./helpers.js";

export default {
  version: 30,
  name: "performance-indexes",
  async up(connection) {
    await addIndexIfMissing(
      connection,
      "team_events",
      "idx_team_events_starts",
      "INDEX idx_team_events_starts (starts_at)"
    );
    await addIndexIfMissing(
      connection,
      "scrim_requests",
      "idx_requests_awaiting",
      "INDEX idx_requests_awaiting (awaiting_team_id, status)"
    );
  }
};
