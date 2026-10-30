// store, small helpers: inTransaction, acquireLock, runExclusive, initializeDatabase, and 2 more.
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { runMigrations } from "./migrations/index.js";

/**
 * Runs `work(connection)` in a transaction: committed when it returns, rolled back when it
 * throws.
 */
export async function inTransaction(ctx, work) {
  const connection = await ctx.pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * An advisory lock of MySQL held on a connection of its OWN, not one of the pool's: a job that keeps a
 * pooled connection for minutes while it needs the pool itself (the roster sync reads and writes the
 * heroes) would starve the pool, for good with DB_POOL_SIZE=1. `name` is the whole lock name (64
 * characters at most: a longer one is hashed). Resolves with `{ release }`, or with null when somebody
 * else holds it. MySQL also frees the lock when the connection dies, so a crashed process never keeps
 * it.
 */
export async function acquireLock(ctx, name) {
  const lockName =
    name.length <= 64 ? name : `hok:${createHash("sha1").update(name).digest("hex")}`;
  const connection = await mysql.createConnection({
    host: ctx.dbConfig.host,
    port: ctx.dbConfig.port,
    user: ctx.dbConfig.user,
    password: ctx.dbConfig.password,
    database: ctx.dbConfig.database,
    ssl: ctx.dbConfig.ssl, // this connection is not one of the pool's: it must be encrypted too
    charset: "utf8mb4",
    connectTimeout: ctx.dbConfig.connectTimeout
  });
  try {
    const [[row]] = await connection.query("SELECT GET_LOCK(?, 0) AS got", [lockName]);
    if (Number(row.got) !== 1) {
      connection.destroy();
      return null;
    }
  } catch (error) {
    connection.destroy();
    throw error;
  }
  return {
    async release() {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch {
        // a connection that is gone has already given the lock back
      } finally {
        connection.destroy();
      }
    }
  };
}

/**
 * Runs `work()` unless another process, this one or another instance of the server behind the same
 * load balancer, is already running the job of that name; then `{ ran: false }` at once. For the jobs
 * on a timer that would otherwise run on every instance (and ask the same remote service several
 * times). The name belongs to the database.
 */
export async function runExclusive(ctx, name, work) {
  const lock = await ctx.acquireLock(`hok:${ctx.dbConfig.database}:${name}`);
  if (!lock) {
    return { ran: false };
  }
  try {
    return { ran: true, result: await work() };
  } finally {
    await lock.release();
  }
}

export async function initializeDatabase(ctx) {
  return runMigrations(ctx.pool, undefined, ctx.log);
}

export async function ping(ctx) {
  await ctx.pool.query("SELECT 1");
}

export async function closeDatabase(ctx) {
  await ctx.pool.end();
}

/** What this file does on the page: bindTo registers them on the view, so that the other files call them as view.name(...). */
export const onView = {
  inTransaction,
  acquireLock,
  runExclusive,
  initializeDatabase,
  ping,
  closeDatabase
};
