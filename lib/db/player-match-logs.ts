import { getDb, isMongoConfigured } from "./mongodb";
import type { RecentFormEntry } from "@/lib/cricket-api/types";

const COLLECTION = "player_match_logs";
const PROCESSED_COLLECTION = "processed_scorecards";

export interface PlayerMatchLog {
  playerId: string;
  matchId: string;
  date: string; // ISO
  opponent: string;
  result: "W" | "L" | "NR";
  runsScored?: number;
  wicketsTaken?: number;
  fantasyPoints: number;
  /** The tournament/series name this match belonged to (e.g. "Indian
   * Premier League 2026") — lets recent form be scoped to the SAME
   * competition as the match being predicted, not blended across
   * unrelated tournaments (different conditions, different opposition
   * quality, different format nuances even within T20). Optional since
   * older logs saved before this field existed won't have it. */
  seriesName?: string;
}

/**
 * Approximate fantasy-points formula — NOT any specific platform's exact
 * scoring rules (Dream11 etc. weight boundaries, strike-rate bonuses,
 * and catches/stumpings differently, and none of that is available from
 * this scorecard shape anyway). Good enough as a RELATIVE form signal —
 * comparing a player's own recent matches against each other — not as an
 * absolute point total. This gets displayed to users, so don't present
 * it as an exact score.
 */
export function estimateBattingPoints(runs: number, fours: number, sixes: number): number {
  return runs + fours + sixes * 2;
}
export function estimateBowlingPoints(wickets: number, maidens: number): number {
  return wickets * 25 + maidens * 8;
}

export async function getProcessedMatchIds(): Promise<Set<string>> {
  if (!isMongoConfigured()) return new Set();
  const db = await getDb();
  const docs = await db.collection<{ _id: string }>(PROCESSED_COLLECTION).find({}).toArray();
  return new Set(docs.map((d) => d._id));
}

interface ProcessedMatchDocument {
  _id: string;
  processedAt: Date;
}

export async function markMatchProcessed(matchId: string): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await db
    .collection<ProcessedMatchDocument>(PROCESSED_COLLECTION)
    .updateOne({ _id: matchId }, { $set: { processedAt: new Date() } }, { upsert: true });
}

export async function saveMatchLogs(entries: PlayerMatchLog[]): Promise<void> {
  if (!isMongoConfigured() || entries.length === 0) return;
  const db = await getDb();
  const ops = entries.map((e) => ({
    updateOne: {
      filter: { playerId: e.playerId, matchId: e.matchId },
      update: { $set: e },
      upsert: true,
    },
  }));
  await db.collection(COLLECTION).bulkWrite(ops);
}

/**
 * Read-only, zero API cost — this is what makes recentForm cheap to
 * serve on every squad fetch. Returns fewer than `limit` entries (even
 * zero) for any player until enough completed matches have been
 * accumulated; callers should treat an empty result as "no data yet",
 * not an error.
 */
export async function getRecentForm(playerId: string, limit = 5): Promise<RecentFormEntry[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  const docs = await db
    .collection<PlayerMatchLog>(COLLECTION)
    .find({ playerId })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    date: d.date,
    opponent: d.opponent,
    result: d.result,
    runsScored: d.runsScored,
    wicketsTaken: d.wicketsTaken,
    fantasyPoints: d.fantasyPoints,
  }));
}

const MIN_SERIES_SCOPED_MATCHES = 2;

/**
 * Prefers form from the SAME tournament as the match being predicted —
 * a player's current IPL form is a more relevant signal for an IPL
 * prediction than blending in old Hundred appearances, even though both
 * are real T20 cricket. Falls back to cross-tournament recentForm
 * (getRecentForm) when there are fewer than MIN_SERIES_SCOPED_MATCHES
 * logged for this specific series yet — early in a tournament, there
 * simply isn't enough same-series history to be a reliable signal on
 * its own, so blending in broader recent form is the honest choice
 * rather than working from 0-1 data points.
 */
export async function getRecentFormForSeries(
  playerId: string,
  seriesName: string | undefined,
  limit = 5,
): Promise<RecentFormEntry[]> {
  if (!isMongoConfigured() || !seriesName) return getRecentForm(playerId, limit);

  const db = await getDb();
  const seriesDocs = await db
    .collection<PlayerMatchLog>(COLLECTION)
    .find({ playerId, seriesName })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();

  if (seriesDocs.length < MIN_SERIES_SCOPED_MATCHES) {
    return getRecentForm(playerId, limit);
  }

  return seriesDocs.map((d) => ({
    date: d.date,
    opponent: d.opponent,
    result: d.result,
    runsScored: d.runsScored,
    wicketsTaken: d.wicketsTaken,
    fantasyPoints: d.fantasyPoints,
  }));
}
