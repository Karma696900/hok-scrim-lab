// Game Simulation: the games a signed-in player finished (the game itself runs in the browser and
// sends nothing while it is played; only its end is kept): the hero, the side and lane, the
// difficulty, the macro grade, whether it was paused, the result and how long it lasted. Additive only.
export default {
  version: 41,
  name: "simulation-games",
  async up(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS simulation_games (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      hero_id VARCHAR(80) NOT NULL,
      side VARCHAR(4) NOT NULL,
      lane VARCHAR(12) NOT NULL,
      difficulty VARCHAR(8) NOT NULL,
      grade VARCHAR(3) NOT NULL,
      score TINYINT UNSIGNED NOT NULL,
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      won BOOLEAN NULL,
      duration_s INT NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_simulation_games_user (user_id, created_at),
      CONSTRAINT fk_simulation_games_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
};
