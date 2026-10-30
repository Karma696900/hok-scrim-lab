// Lanes an administrator took away from a hero. Camp lists one lane per hero and a roster sync
// rewrites it, so a lane that Camp lists can only be hidden by remembering the removal here; a lane
// added by hand is simply deleted from hero_lane_additions. A hero always keeps at least one lane.
// Additive only.
export default {
  version: 20,
  name: "hero-lane-removals",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS hero_lane_removals (
      hero_id VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL,
      lane VARCHAR(20) NOT NULL,
      removed_by VARCHAR(36) NULL,
      created_at VARCHAR(40) NOT NULL,
      PRIMARY KEY (hero_id, lane),
      CONSTRAINT fk_lane_removals_hero FOREIGN KEY (hero_id) REFERENCES heroes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
