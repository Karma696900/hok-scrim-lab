// How sure a tournament series is. verified = read from the video AND checked by a person (or entered by hand
// from the source); video = read from the video by the extraction tool, with points still to check (to_check);
// listed = taken from a results page that lists heroes and lanes but not the order of the picks. Only the
// first two know the real order of the picks and bans, so only they feed the statistics of that order.
// Additive only: the series already there were entered by hand, they stay verified.
export default {
  version: 35,
  name: "series-verification",
  async up(connection) {
    await connection.query(
      "ALTER TABLE competitive_series ADD COLUMN verification VARCHAR(12) NOT NULL DEFAULT 'verified', ADD COLUMN to_check TEXT NULL, ADD INDEX idx_competitive_series_verification (verification)"
    );
  }
};
