import { rateLimit } from "express-rate-limit";

const baseLimiterConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
};

export const globalLimiter = rateLimit({
  ...baseLimiterConfig,
  windowMs: 15 * 60 * 1000,
  limit: 200
});

export const authLimiter = rateLimit({
  ...baseLimiterConfig,
  windowMs: 15 * 60 * 1000,
  limit: 30
});

export const webhookLimiter = rateLimit({
  ...baseLimiterConfig,
  windowMs: 15 * 60 * 1000,
  limit: 120
});
