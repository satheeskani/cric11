import { getDb, isMongoConfigured } from "./mongodb";

export interface CacheEntry<T> {
  value: T;
  cachedAt: Date;
}

interface CacheDocument {
  _id: string;
  value: unknown;
  cachedAt: Date;
}

const COLLECTION = "api_cache";

export const TTL = {
  PLAYER_SQUAD_MS: 6 * 60 * 60 * 1000, // 6 hours — player/squad data
  VENUE_MS: 24 * 60 * 60 * 1000, // 24 hours — venue data
  WEATHER_MS: 3 * 60 * 60 * 1000, // 3 hours — weather forecast
} as const;

export function isStale(cachedAt: Date, ttlMs: number): boolean {
  return Date.now() - cachedAt.getTime() > ttlMs;
}

/**
 * Read-only lookup used by user-facing API routes. Never calls an
 * external API — that only happens from the cron refresh job (cricket
 * data) or the weather route (ample free quota, so fetched on demand).
 * Returns null if Mongo isn't configured or the key was never cached,
 * so callers can fall back to mock data in local dev.
 */
export async function getCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  const doc = await db.collection<CacheDocument>(COLLECTION).findOne({ _id: key });
  if (!doc) return null;
  return { value: doc.value as T, cachedAt: doc.cachedAt };
}

export async function setCacheEntry<T>(key: string, value: T): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await db
    .collection<CacheDocument>(COLLECTION)
    .updateOne({ _id: key }, { $set: { value, cachedAt: new Date() } }, { upsert: true });
}
