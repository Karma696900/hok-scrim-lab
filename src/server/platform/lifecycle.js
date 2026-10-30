/**
 * Graceful shutdown: stop accepting connections, let in-flight requests finish, release resources
 * (timers, MySQL pool), then exit. A hard timeout guarantees the process does not hang. `exit` and
 * `server` are injected so the behaviour can be tested without killing the test process.
 * `drainMs` (SHUTDOWN_DRAIN_SECONDS) is the wait between "I am leaving" (the readiness check answers
 * 503) and the moment the server stops listening: for a load balancer, 5 to 10 seconds.
 */
export function createShutdown({
  server,
  closeResources = async () => {},
  logger,
  timeoutMs = 10_000,
  drainMs = 0,
  onDrain = () => {},
  exit = code => process.exit(code)
}) {
  let closing = false;
  return function shutdown(signal) {
    if (closing) {
      return;
    }
    closing = true;
    logger.info("shutting down", { signal });
    // Behind a load balancer: the readiness check starts answering 503 NOW, and the server keeps
    // accepting for `drainMs` more, so that the balancer has seen it and sent the next requests to
    // the other instances before this one stops listening (a rolling deploy then drops nothing).
    onDrain();
    const force = setTimeout(() => {
      logger.error("forced exit: connections did not drain in time");
      exit(1);
    }, drainMs + timeoutMs);
    force.unref?.();
    const stop = () => {
      server.close(async error => {
        try {
          await closeResources();
        } catch (failure) {
          logger.warn("error while releasing resources", { message: failure.message });
        }
        clearTimeout(force);
        exit(error ? 1 : 0);
      });
      server.closeIdleConnections?.();
    };
    if (drainMs > 0) {
      setTimeout(stop, drainMs).unref?.();
    } else {
      stop();
    }
  };
}

/**
 * Wires signals and last-resort error handlers. Errors are logged without secrets, then the process
 * leaves cleanly.
 */
export function installProcessHandlers({ shutdown, logger, exit = code => process.exit(code) }) {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", reason => {
    logger.error("unhandled promise rejection", { message: reason?.message ?? String(reason) });
  });
  process.on("uncaughtException", error => {
    logger.error("uncaught exception", { message: error?.message, stack: error?.stack });
    shutdown("uncaughtException");
    setTimeout(() => exit(1), 2000).unref?.();
  });
}
