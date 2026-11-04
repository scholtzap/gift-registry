import { z } from "zod";

/**
 * One contract for every environment variable the app reads. Fails at boot rather
 * than at the first request that needs the value — and `demoMode` is only ever true
 * when it is explicitly set, so a missing key can never silently become a fixture.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  /** Separate database for the leak suite: RLS assertions must never run against dev data. */
  DATABASE_URL_TEST: z.string().url().optional(),
  SESSION_SECRET: z
    .string()
    .min(32)
    .describe("32+ chars; signs the role-scoped session cookie"),
  // RN-D M6/Gate 5: the phone-hash pepper is a separate secret from the
  // session signer, so one leaked secret cannot both mint sessions and crack
  // hashed phone numbers offline. Boot-checked below.
  PHONE_HASH_PEPPER: z
    .string()
    .min(32)
    .describe("32+ chars; peppers every keyed phone hash, distinct from SESSION_SECRET"),
  CIRCLE_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Production is behind Caddy, which overwrites X-Forwarded-For at the proxy.
   * The header is honoured for throttle keys only when this is "on" (RN-D Gate 3);
   * default "off" keeps the local demo honest instead of trusting client claims.
   * The shared Postgres throttle budget activates on this same switch (F2).
   */
  TRUSTED_PROXY: z.enum(["on", "off"]).default("off"),

  WHATSAPP_APP_SECRET: z.string().min(32).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /** The WABA asset every template and send call addresses. ID only, never a credential. */
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v23.0"),

  /**
   * Cloudflare Turnstile bot gate (F12). Unset = open seam for dev/demo/test;
   * set BOTH before external users arrive. The secret verifies tokens
   * server-side, the site key renders the widget in the gate/hub/lookup
   * forms. One without the other is a deploy misconfiguration, not a mode.
   */
  TURNSTILE_SECRET: z.string().min(20).optional(),
  TURNSTILE_SITE_KEY: z.string().min(10).optional(),

  MODEL_API_KEY: z.string().startsWith("LLM_").optional(),
  MODEL_API_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  // ARCHITECTURE §5: 1.2 takes anything with pixels or audio in it, 1.3 is text-only reasoning.
  // Spark 1.3's audio understanding is documented as degraded, and image intake shares the path.
  MODEL_DAILY_SPEND_LIMIT: z.coerce.number().int().min(0).default(200),

  MODEL_INTAKE: z.string().default("muse-spark-1.2"),
  MODEL_VISION: z.string().default("muse-spark-1.2"),
  MODEL_TRANSCRIBE: z.string().default("muse-voice-transcribe-1.0"),
  MODEL_IMAGE: z.string().default("muse-image-1.0"),

  MEDIA_DIR: z.string().default("/data/media"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  DEMO_MODE: z.enum(["on", "off"]).default("off"),
  /// Vault `RESEND_API_KEY` (shared / single). Empty while DEMO_MODE=on.
  RESEND_API_KEY: z.string().min(8).optional(),
  /// From address on a domain verified in Resend. A display name form is allowed.
  OTP_FROM_EMAIL: z.string().min(3).optional(),
}).superRefine((value, ctx) => {
  if (value.PHONE_HASH_PEPPER === value.SESSION_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["PHONE_HASH_PEPPER"],
      message: "must differ from SESSION_SECRET (RN-D M6: one secret, one failure domain)",
    });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
