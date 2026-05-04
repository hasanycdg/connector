import dotenv from "dotenv";
import { z } from "zod";

const envFilePath = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFilePath, override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),

  FIREBASE_PROJECT_ID: z.string().default("connector-f0cf8"),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_USE_APPLICATION_DEFAULT: z.enum(["true", "false"]).default("false"),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  FIRESTORE_COLLECTION_PREFIX: z.string().default("review_assistant"),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),

  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),

  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().min(1),

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

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined =>
  values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();

const resolvedSupabaseUrl = firstNonEmpty(
  parsedEnv.data.SUPABASE_URL,
  parsedEnv.data.NEXT_PUBLIC_SUPABASE_URL
);

const resolvedSupabaseKey = firstNonEmpty(
  parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY,
  parsedEnv.data.SUPABASE_ANON_KEY,
  parsedEnv.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

if (!resolvedSupabaseUrl || !resolvedSupabaseKey) {
  throw new Error(
    "Invalid environment configuration: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
  );
}

const normalizedBaseUrl = parsedEnv.data.APP_BASE_URL.endsWith("/")
  ? parsedEnv.data.APP_BASE_URL.slice(0, -1)
  : parsedEnv.data.APP_BASE_URL;

export const env = {
  ...parsedEnv.data,
  SUPABASE_URL: resolvedSupabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: resolvedSupabaseKey,
  TRUST_PROXY: parsedEnv.data.TRUST_PROXY === "true",
  FIREBASE_USE_APPLICATION_DEFAULT: parsedEnv.data.FIREBASE_USE_APPLICATION_DEFAULT === "true",
  APP_BASE_URL: normalizedBaseUrl
};
