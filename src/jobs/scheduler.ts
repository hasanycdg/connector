import cron from "node-cron";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { pollReviewsForAllBusinesses } from "../services/reviewPolling.service.js";

let isPolling = false;

export const startPollingScheduler = (): void => {
  cron.schedule(
    env.POLL_CRON_SCHEDULE,
    async () => {
      if (isPolling) {
        logger.warn("Skipping cron poll because previous run is still active.");
        return;
      }

      isPolling = true;

      try {
        const summary = await pollReviewsForAllBusinesses("cron");

        logger.info({ summary }, "Cron review polling completed");
      } catch (error) {
        logger.error({ err: error }, "Cron review polling failed");
      } finally {
        isPolling = false;
      }
    },
    {
      timezone: env.POLL_TIMEZONE,
      noOverlap: true,
      maxRandomDelay: env.POLL_STAGGER_SECONDS * 1000
    }
  );

  logger.info(
    {
      schedule: env.POLL_CRON_SCHEDULE,
      timezone: env.POLL_TIMEZONE
    },
    "Review polling scheduler started"
  );
};
