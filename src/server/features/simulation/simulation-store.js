// The games of the game simulation a signed-in player finished: kept, counted and listed back.
import { randomUUID } from "node:crypto";

export function createSimulationStore({ pool }) {
  return {
    async addSimulationGame(userId, game, now = Date.now()) {
      await pool.execute(
        "INSERT INTO simulation_games (id, user_id, hero_id, side, lane, difficulty, grade, score, paused, won, duration_s, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          randomUUID(),
          userId,
          game.heroId,
          game.side,
          game.lane,
          game.difficulty,
          game.grade,
          game.score,
          game.paused,
          game.won,
          game.duration,
          now
        ]
      );
    },

    /** How many games a player kept since a moment. */
    async simulationGamesSince(userId, since) {
      const [[row]] = await pool.execute(
        "SELECT COUNT(*) AS total FROM simulation_games WHERE user_id = ? AND created_at >= ?",
        [userId, since]
      );
      return Number(row.total);
    },

    /** The player's last games, newest first. */
    async listSimulationGames(userId, limit = 20) {
      const [rows] = await pool.query(
        "SELECT hero_id, side, lane, difficulty, grade, score, paused, won, duration_s, created_at FROM simulation_games WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        [userId, limit]
      );
      return rows.map(row => ({
        heroId: row.hero_id,
        side: row.side,
        lane: row.lane,
        difficulty: row.difficulty,
        grade: row.grade,
        score: row.score,
        paused: Boolean(row.paused),
        won: row.won === null ? null : Boolean(row.won),
        duration: row.duration_s,
        playedAt: Number(row.created_at)
      }));
    }
  };
}
