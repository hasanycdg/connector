import { Router } from "express";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { pollReviewsForAllBusinesses } from "../services/reviewPolling.service.js";

const router = Router();

router.post(
  "/poll-reviews",
  asyncHandler(async (request, response) => {
    if (env.INTERNAL_JOB_API_KEY) {
      const providedKey = request.header("x-job-key");

      if (providedKey !== env.INTERNAL_JOB_API_KEY) {
        throw new AppError("Unauthorized job trigger.", 401);
      }
    }

    const summary = await pollReviewsForAllBusinesses("manual");

    response.status(200).json({
      ok: true,
      summary
    });
  })
);

export const jobsRoutes = router;
