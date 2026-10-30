// Whether the order of the picks of a series is known, apart from how sure the series is (035). A series can be
// checked against its results page (verified) without anybody having seen the order: that page lists the heroes
// by lane, not by pick. Only the series whose order is known feed the statistics of that order.
// Additive: the series that were `listed` (a list of heroes) do not know it, the others do.
export default {
  version: 38,
  name: "series-pick-order",
  async up(connection) {
    await connection.query(
      "ALTER TABLE competitive_series ADD COLUMN pick_order_known TINYINT(1) NOT NULL DEFAULT 1"
    );
    await connection.query(
      "UPDATE competitive_series SET pick_order_known = 0 WHERE verification = 'listed'"
    );
  }
};
