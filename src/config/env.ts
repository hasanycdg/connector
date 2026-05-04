import dotenv from "dotenv";
import { z } from "zod";

const envFilePath = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFilePath, override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().min(1),
  FIREBASE_API_KEY: z.string().default("AIzaSyDiuXlpW8yO4ws9OsPVCaQQbjyBsbK0s8E"),
  FIREBASE_AUTH_DOMAIN: z.string().default("connector-f0cf8.firebaseapp.com"),
  FIREBASE_PROJECT_ID: z.string().default("connector-f0cf8"),
  FIREBASE_STORAGE_BUCKET: z.string().default("connector-f0cf8.firebasestorage.app"),
  FIREBASE_MESSAGING_SENDER_ID: z.string().default("161119145362"),
  FIREBASE_APP_ID: z.string().default("1:161119145362:web:b74bb05aa8dc3ac618054b"),
  FIREBASE_MEASUREMENT_ID: z.string().default("G-NWXKPR49ND"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  APP_BASE_URL: z.url(),
  POLL_CRON_SCHEDULE: z.string().default("0 10,18 * * *"),
  POLL_TIMEZONE: z.string().default("UTC"),
  POLL_STAGGER_SECONDS: z.coerce.number().int().min(0).max(300).default(7),
  POLL_CONCURRENCY: z.coerce.number().int().min(1).max(3).default(1),
  INTERNAL_JOB_API_KEY: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

const normalizedBaseUrl = parsedEnv.data.APP_BASE_URL.endsWith("/")
  ? parsedEnv.data.APP_BASE_URL.slice(0, -1)
  : parsedEnv.data.APP_BASE_URL;

export const env = {
  ...parsedEnv.data,
  APP_BASE_URL: normalizedBaseUrl
};
