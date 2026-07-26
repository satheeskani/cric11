import { getDb, isMongoConfigured } from "./mongodb";

interface ApiUsageDocument {
  _id: string; // `${provider}:${utcDateBucket}`
  provider: string;
  date: string;
  count: number;
}

const COLLECTION = "api_usage";

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd
}

/**
 * CricketData.org's free tier caps at 100 hits/day. The cron refresh job
 * calls this before every external request so it can stop early rather
 * than burning through the daily quota mid-run and getting locked out for
 * the rest of the day.
 */
export async function getUsageToday(provider: string): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const doc = await db.collection<ApiUsageDocument>(COLLECTION).findOne({ _id: `${provider}:${todayBucket()}` });
  return doc?.count ?? 0;
}

export async function recordApiHit(provider: string): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const key = `${provider}:${todayBucket()}`;
  const result = await db
    .collection<ApiUsageDocument>(COLLECTION)
    .findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $set: { provider, date: todayBucket() } },
      { upsert: true, returnDocument: "after" },
    );
  return result?.count ?? 1;
}

export async function hasBudgetRemaining(provider: string, dailyLimit: number): Promise<boolean> {
  const used = await getUsageToday(provider);
  return used < dailyLimit;
}

function monthBucket(): string {
  return new Date().toISOString().slice(0, 7); // UTC yyyy-mm
}

/**
 * Cricbuzz Cricket (RapidAPI) Basic plan caps at 200 requests/month, not
 * per-day like CricketData.org, so this needs its own bucket granularity
 * alongside the daily one above rather than reusing it.
 */
export async function getUsageThisMonth(provider: string): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const doc = await db
    .collection<ApiUsageDocument>(COLLECTION)
    .findOne({ _id: `${provider}:month:${monthBucket()}` });
  return doc?.count ?? 0;
}

export async function recordApiHitMonthly(provider: string): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const key = `${provider}:month:${monthBucket()}`;
  const result = await db
    .collection<ApiUsageDocument>(COLLECTION)
    .findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $set: { provider, date: monthBucket() } },
      { upsert: true, returnDocument: "after" },
    );
  return result?.count ?? 1;
}

export async function hasMonthlyBudgetRemaining(provider: string, monthlyLimit: number): Promise<boolean> {
  const used = await getUsageThisMonth(provider);
  return used < monthlyLimit;
}
