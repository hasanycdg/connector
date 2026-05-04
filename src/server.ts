import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startPollingScheduler } from "./jobs/scheduler.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
  startPollingScheduler();
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutting down server");

  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
