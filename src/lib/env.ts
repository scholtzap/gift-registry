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
  CIRCLE_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),

  WHATSAPP_APP_SECRET: z.string().min(32).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v23.0"),

  MODEL_API_KEY: z.string().startsWith("LLM_").optional(),
  MODEL_API_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  // ARCHITECTURE §5: 1.2 takes anything with pixels or audio in it, 1.3 is text-only reasoning.
  // Spark 1.3's audio understanding is documented as degraded, and image intake shares the path.
  MODEL_INTAKE: z.string().default("muse-spark-1.2"),
  MODEL_VISION: z.string().default("muse-spark-1.2"),
  MODEL_TRANSCRIBE: z.string().default("muse-voice-transcribe-1.0"),
  MODEL_IMAGE: z.string().default("muse-image-1.0"),

  MEDIA_DIR: z.string().default("/data/media"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  DEMO_MODE: z.enum(["on", "off"]).default("off"),
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
