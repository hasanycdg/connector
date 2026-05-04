import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authLimiter, globalLimiter, webhookLimiter } from "./middleware/rateLimit.js";
import { authRoutes } from "./routes/auth.routes.js";
import { dashboardRoutes } from "./routes/dashboard.routes.js";
import { jobsRoutes } from "./routes/jobs.routes.js";
import { twilioRoutes } from "./routes/twilio.routes.js";

const app = express();

app.set("trust proxy", env.TRUST_PROXY ? 1 : false);

app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);

app.get("/healthz", (_request, response) => {
  response.status(200).json({ ok: true });
});

app.get("/", (_request, response) => {
  response.redirect("/dashboard");
});

app.use("/dashboard", authLimiter, dashboardRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/webhooks/twilio", webhookLimiter, twilioRoutes);

app.use(errorHandler);

export { app };
