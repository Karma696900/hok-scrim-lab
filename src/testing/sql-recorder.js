/**
 * Runs `work()` and returns what it returned together with the SQL statements the pool ran in the
 * meantime (the ones sent through the pool itself and the ones sent on a connection taken for a
 * transaction). Lets a test pin the NUMBER of queries a request needs, which is how a query per row of a
 * list (an N+1) shows up.
 */
export async function recordStatements(pool, work) {
  const statements = [];
  const patch = (target, method) => {
    const original = target[method];
    target[method] = function recorded(sql, ...rest) {
      if (typeof sql === "string") {
        statements.push(sql.replace(/\s+/g, " ").trim());
      }
      return original.call(this, sql, ...rest);
    };
    return () => {
      target[method] = original;
    };
  };
  const undo = [patch(pool, "query"), patch(pool, "execute")];
  const getConnection = pool.getConnection;
  pool.getConnection = async function recordedConnection() {
    const connection = await getConnection.call(this);
    const restore = [patch(connection, "query"), patch(connection, "execute")];
    const release = connection.release;
    connection.release = function recordedRelease(...args) {
      for (const fn of restore) {
        fn();
      }
      connection.release = release;
      return release.apply(this, args);
    };
    return connection;
  };
  undo.push(() => {
    pool.getConnection = getConnection;
  });
  try {
    const result = await work();
    return { result, statements };
  } finally {
    for (const fn of undo) {
      fn();
    }
  }
}
