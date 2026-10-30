// Three more indexes, found by reading every SQL statement of the server (a static audit) and measured on a
// throw-away database with 150 000 users, 120 000 reflex runs and 120 000 notifications (median of 5):
//
//  - users(is_guest): the hourly purge of guests (`DELETE ... WHERE is_guest = TRUE AND no session...`)
//    read every user of the site: 149 094 rows, and with the DELETE locked them while it ran, so a login
//    could wait for it. It now reads the 1 500 guests (plan `ALL` -> `ref`, 190 ms -> 86 ms with the
//    deletions themselves).
//  - reflex_runs(user_id, exercise, score): the best score and the number of runs of a player
//    (`COUNT, MIN(score), MAX(score)`) are asked on every run submitted and for the whole roster in the
//    team ranking. The score was only in the table, so each run of the player cost a lookup: 21.6 ms for
//    a player with 20 000 runs. With the score in the index the answer comes from the index alone: 3.5 ms.
//  - notifications(user_id, created_at): the list ends in `ORDER BY created_at DESC LIMIT 50`. The only
//    index for the person began with `read_at`, so MySQL sorted all their notifications (never purged)
//    to keep fifty: 38 578 rows sorted, 70 ms. It now walks the index backwards and stops: 1.9 ms.
//
// Additive only: no column, no row is touched, and the older indexes stay.
import { addIndexIfMissing } from "./helpers.js";

export default {
  version: 31,
  name: "audit-indexes",
  async up(connection) {
    await addIndexIfMissing(
      connection,
      "users",
      "idx_users_guest",
      "INDEX idx_users_guest (is_guest)"
    );
    await addIndexIfMissing(
      connection,
      "reflex_runs",
      "idx_reflex_runs_score",
      "INDEX idx_reflex_runs_score (user_id, exercise, score)"
    );
    await addIndexIfMissing(
      connection,
      "notifications",
      "idx_notifications_recent",
      "INDEX idx_notifications_recent (user_id, created_at)"
    );
  }
};
