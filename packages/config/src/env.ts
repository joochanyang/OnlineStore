import { z } from "zod";

/**
 * Environment schema. Group by domain so partial parsing is possible (e.g., a worker
 * that doesn't need Toss can `parseEnv("auth", "ai")` only). Required vs optional is
 * enforced lazily — fields that aren't needed in dev get `.optional()`.
 *
 * The full schema is intentionally large because everything that ships to production
 * must be visible here. If a key is missing from this file, it must NOT be read via
 * raw `process.env` from application code.
 */

const hex64 = z
  .string()
  .min(64, "must be hex with at least 64 chars (32 bytes)")
  .regex(/^[0-9a-fA-F]+$/, "must be hex");

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_WEB_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_ADMIN_URL: z.string().url().default("http://localhost:3001"),
});

export const dbEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
});

export const supabaseEnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export const authEnvSchema = z.object({
  AUTH_JWT_SECRET: hex64,
  AUTH_CSRF_SECRET: hex64,
  AUTH_ISSUER: z.string().min(1).default("commerce-platform"),
  AUTH_AUDIENCE_WEB: z.string().min(1).default("commerce-web"),
  AUTH_AUDIENCE_ADMIN: z.string().min(1).default("commerce-admin"),
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
});

export const paymentEnvSchema = z.object({
  TOSS_CLIENT_KEY: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  TOSS_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_MODE: z.enum(["mock", "sandbox", "live"]).default("mock"),
});

export const storageEnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("commerce-assets"),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  CLOUDFLARE_IMAGES_ACCOUNT_HASH: z.string().optional(),
  CLOUDFLARE_IMAGES_TOKEN: z.string().optional(),
});

export const cacheEnvSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export const searchEnvSchema = z.object({
  MEILISEARCH_HOST: z.string().url().optional(),
  MEILISEARCH_API_KEY: z.string().optional(),
});

export const emailEnvSchema = z.object({
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export const messagingEnvSchema = z.object({
  SOLAPI_API_KEY: z.string().optional(),
  SOLAPI_API_SECRET: z.string().optional(),
  SOLAPI_SENDER_NUMBER: z.string().optional(),
  SOLAPI_PFID: z.string().optional(),
  NCLOUD_SENS_ACCESS_KEY: z.string().optional(),
  NCLOUD_SENS_SECRET_KEY: z.string().optional(),
  NCLOUD_SENS_SERVICE_ID: z.string().optional(),
});

export const pushEnvSchema = z.object({
  EXPO_ACCESS_TOKEN: z.string().optional(),
  FCM_SERVER_KEY: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
});

export const aiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_DAILY_USD_CAP: z.coerce.number().positive().default(3),
  AI_MONTHLY_USD_CAP: z.coerce.number().positive().default(80),
});

export const observabilityEnvSchema = z.object({
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
});

export const workflowEnvSchema = z.object({
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export const fullEnvSchema = appEnvSchema
  .merge(dbEnvSchema)
  .merge(supabaseEnvSchema)
  .merge(authEnvSchema)
  .merge(paymentEnvSchema)
  .merge(storageEnvSchema)
  .merge(cacheEnvSchema)
  .merge(searchEnvSchema)
  .merge(emailEnvSchema)
  .merge(messagingEnvSchema)
  .merge(pushEnvSchema)
  .merge(aiEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(workflowEnvSchema);

export type AppEnv = z.infer<typeof fullEnvSchema>;

export type EnvParseInput = NodeJS.ProcessEnv | Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    const summary = issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n  ");
    super(`Invalid environment configuration:\n  ${summary}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export function parseAppEnv(env: EnvParseInput): AppEnv {
  const result = fullEnvSchema.safeParse(env);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}

export function parseAppEnvSafe(env: EnvParseInput):
  | { ok: true; env: AppEnv }
  | { ok: false; error: EnvValidationError } {
  const result = fullEnvSchema.safeParse(env);
  if (!result.success) {
    return { ok: false, error: new EnvValidationError(result.error.issues) };
  }
  return { ok: true, env: result.data };
}

/**
 * Convenience guard for production runtime: requires all `production`-critical fields.
 * Use this in app boot (Next.js instrumentation hook, worker entry).
 */
export function assertProductionEnv(env: AppEnv): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  const required: Array<[string, unknown]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["SUPABASE_URL", env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
    ["TOSS_SECRET_KEY", env.TOSS_SECRET_KEY],
    ["TOSS_WEBHOOK_SECRET", env.TOSS_WEBHOOK_SECRET],
    ["UPSTASH_REDIS_REST_URL", env.UPSTASH_REDIS_REST_URL],
    ["UPSTASH_REDIS_REST_TOKEN", env.UPSTASH_REDIS_REST_TOKEN],
    ["RESEND_API_KEY", env.RESEND_API_KEY],
    ["SENTRY_DSN", env.SENTRY_DSN],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Production env missing required keys: ${missing.join(", ")}`);
  }
}
