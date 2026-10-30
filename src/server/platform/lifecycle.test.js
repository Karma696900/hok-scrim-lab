// Graceful shutdown and liveness, without killing the test process.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, test } from "node:test";
import { createShutdown } from "./lifecycle.js";
import { createLogger } from "./logger.js";

const quiet = () => {
  const lines = [];
  return {
    lines,
    logger: createLogger({ level: "debug", sink: line => lines.push(JSON.parse(line)) })
  };
};

function fakeServer({ closeError = null, delay = 0 } = {}) {
  const calls = [];
  return {
    calls,
    close(callback) {
      calls.push("close");
      setTimeout(() => callback(closeError), delay);
    },
    closeIdleConnections() {
      calls.push("closeIdleConnections");
    }
  };
}

describe("graceful shutdown", () => {
  test("stops accepting, releases resources, then exits 0", async () => {
    const { logger, lines } = quiet();
    const server = fakeServer();
    const order = [];
    let code = null;
    const done = new Promise(resolve => {
      const shutdown = createShutdown({
        server,
        logger,
        closeResources: async () => {
          order.push("resources");
        },
        exit: value => {
          order.push("exit");
          code = value;
          resolve();
        }
      });
      shutdown("SIGTERM");
    });
    await done;
    assert.deepEqual(server.calls, ["close", "closeIdleConnections"]);
    assert.deepEqual(order, ["resources", "exit"]);
    assert.equal(code, 0);
    assert.ok(lines.some(line => line.msg === "shutting down" && line.signal === "SIGTERM"));
  });

  test("a second signal does nothing", async () => {
    const { logger } = quiet();
    const server = fakeServer({ delay: 20 });
    let exits = 0;
    const shutdown = createShutdown({
      server,
      logger,
      exit: () => {
        exits += 1;
      }
    });
    shutdown("SIGTERM");
    shutdown("SIGINT");
    shutdown("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(server.calls.filter(call => call === "close").length, 1);
    assert.equal(exits, 1);
  });

  test("a failure while releasing resources is logged and the process still exits", async () => {
    const { logger, lines } = quiet();
    let code = null;
    await new Promise(resolve =>
      createShutdown({
        server: fakeServer(),
        logger,
        closeResources: async () => {
          throw new Error("pool already closed");
        },
        exit: value => {
          code = value;
          resolve();
        }
      })("SIGTERM")
    );
    assert.equal(code, 0);
    assert.ok(
      lines.some(line => line.level === "warn" && /pool already closed/.test(line.message))
    );
  });

  test("a server that fails to close exits with 1", async () => {
    const { logger } = quiet();
    let code = null;
    await new Promise(resolve =>
      createShutdown({
        server: fakeServer({ closeError: new Error("boom") }),
        logger,
        exit: value => {
          code = value;
          resolve();
        }
      })("SIGTERM")
    );
    assert.equal(code, 1);
  });

  test("connections that never drain are cut by the hard timeout", async () => {
    const { logger, lines } = quiet();
    let code = null;
    const server = new EventEmitter();
    server.close = () => {}; // never calls back
    await new Promise(resolve =>
      createShutdown({
        server,
        logger,
        timeoutMs: 30,
        exit: value => {
          code = value;
          resolve();
        }
      })("SIGTERM")
    );
    assert.equal(code, 1);
    assert.ok(lines.some(line => line.level === "error" && /forced exit/.test(line.msg)));
  });
});

describe("leaving a load balancer's pool", () => {
  test("readiness goes first, the server keeps listening for the drain time, then it closes", async () => {
    const { logger } = quiet();
    const server = fakeServer();
    const events = [];
    const started = Date.now();
    let closedAfter = null;
    server.close = callback => {
      closedAfter = Date.now() - started;
      events.push("close");
      callback(null);
    };
    await new Promise(resolve =>
      createShutdown({
        server,
        logger,
        drainMs: 60,
        onDrain: () => events.push("draining"),
        closeResources: async () => events.push("resources"),
        exit: () => {
          events.push("exit");
          resolve();
        }
      })("SIGTERM")
    );
    assert.deepEqual(events, ["draining", "close", "resources", "exit"]);
    assert.ok(
      closedAfter >= 55,
      `still listening during the drain, closed after ${closedAfter} ms`
    );
  });

  test("with no drain time nothing waits (a single instance restarts at once)", async () => {
    const { logger } = quiet();
    const server = fakeServer();
    const events = [];
    await new Promise(resolve =>
      createShutdown({
        server,
        logger,
        onDrain: () => events.push("draining"),
        exit: () => {
          events.push("exit");
          resolve();
        }
      })("SIGTERM")
    );
    assert.deepEqual(events, ["draining", "exit"]);
    assert.deepEqual(server.calls, ["close", "closeIdleConnections"]);
  });

  test("the hard timeout counts from the end of the drain, not from the signal", async () => {
    const { logger, lines } = quiet();
    const server = new EventEmitter();
    server.close = () => {}; // never calls back
    const started = Date.now();
    let code = null;
    await new Promise(resolve =>
      createShutdown({
        server,
        logger,
        drainMs: 40,
        timeoutMs: 40,
        exit: value => {
          code = value;
          resolve();
        }
      })("SIGTERM")
    );
    assert.equal(code, 1);
    assert.ok(Date.now() - started >= 75, "40 ms of drain + 40 ms of patience");
    assert.ok(lines.some(line => /forced exit/.test(line.msg)));
  });
});
