/**
 * Central list of env vars the app cannot run correctly in production
 * without. Checked by GET /api/health so a missing var surfaces as one
 * clear message up front, rather than as a confusing failure deep inside
 * whichever request handler first happens to touch it.
 *
 * Never log or return the *values* here — only names/presence.
 */
export const REQUIRED_ENV_VARS = [
  "CRICKETDATA_API_KEY",
  "OPENWEATHER_API_KEY",
  "MONGODB_URI",
  "CRON_SECRET",
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

export function checkRequiredEnvVars(): { ok: boolean; missing: RequiredEnvVar[] } {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  return { ok: missing.length === 0, missing };
}

/**
 * Throws a clear, specific error naming the missing var. Use this at the
 * top of any code path that's about to actually use one of these vars
 * (e.g. a provider constructor), instead of letting `undefined` propagate
 * into a fetch URL or connection string and fail with an opaque error.
 */
export function getRequiredEnv(name: RequiredEnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in .env.local (see .env.local.example) ` +
        `or in your Vercel project's Environment Variables.`,
    );
  }
  return value;
}
