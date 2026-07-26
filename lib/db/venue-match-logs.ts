import { getDb, isMongoConfigured } from "./mongodb";
import type { VenueStats } from "@/lib/cricket-api/types";

const COLLECTION = "venue_match_logs";

export interface VenueMatchLog {
  venueId: string;
  matchId: string;
  date: string;
  firstInningsRuns?: number;
  secondInningsRuns?: number;
  /** "Batting" or "Bowling" — the toss winner's real decision at this
   * venue, from mcenter/v1/{id}/leanback's tossresults. Optional since
   * fetching it costs a genuinely separate API call (see
   * CricbuzzProvider.getMatchTossInfo) — not every logged match will
   * have this populated. */
  tossDecision?: string;
}

interface VenueMatchLogDoc extends VenueMatchLog {
  _id: string;
}

export async function saveVenueLog(entry: VenueMatchLog): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  const _id = `${entry.venueId}:${entry.matchId}`;
  await db
    .collection<VenueMatchLogDoc>(COLLECTION)
    .updateOne({ _id }, { $set: { ...entry, _id } }, { upsert: true });
}

/**
 * Aggregates accumulated completed-match innings scores for a venue into
 * the same VenueStats shape the app already uses. Returns null until at
 * least one real completed match has been logged here — an honest "no
 * data yet", not a fabricated average.
 *
 * pitchType is a rough heuristic derived from combined average score,
 * NOT a real pitch/groundstaff report — treat it as approximate
 * wherever it's shown. avgBoundaryCount isn't computed from real data
 * yet (the scorecard has per-player fours/sixes that could feed it) —
 * returns an honest placeholder 0. tossWinBattingBias IS now computed
 * from real accumulated toss decisions (see saveVenueLog's
 * tossDecision field), falling back to neutral 0.5 only when no toss
 * data has been logged for this venue yet.
 */
export async function getVenueStatsFromLogs(venueId: string): Promise<VenueStats | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  const logs = await db.collection<VenueMatchLogDoc>(COLLECTION).find({ venueId }).toArray();
  if (logs.length === 0) return null;

  const avg = (nums: number[]) => (nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
  const firstInnings = logs.map((l) => l.firstInningsRuns).filter((r): r is number => r != null);
  const secondInnings = logs.map((l) => l.secondInningsRuns).filter((r): r is number => r != null);

  const avgFirstInningsScore = Math.round(avg(firstInnings));
  const avgSecondInningsScore = Math.round(avg(secondInnings));
  const combinedAvg =
    secondInnings.length > 0 ? (avgFirstInningsScore + avgSecondInningsScore) / 2 : avgFirstInningsScore;

  const pitchType: VenueStats["pitchType"] =
    combinedAvg > 170 ? "batting" : combinedAvg > 0 && combinedAvg < 130 ? "bowling" : "balanced";

  // Real toss bias: fraction of logged matches where the toss winner
  // chose to bat first at this venue. Only counts logs where toss data
  // was actually fetched (see tossDecision's doc comment on why it's
  // optional) — falls back to a neutral 0.5 if none have it yet, same
  // honest "no data" pattern as everything else here, not a guess.
  const tossDecisions = logs.map((l) => l.tossDecision).filter((d): d is string => !!d);
  const tossWinBattingBias =
    tossDecisions.length > 0
      ? tossDecisions.filter((d) => d.toLowerCase().includes("bat")).length / tossDecisions.length
      : 0.5;

  return {
    id: venueId,
    name: `Venue ${venueId}`, // real venue name lives on the match/squad objects separately, not tracked here
    avgFirstInningsScore,
    avgSecondInningsScore,
    pitchType,
    avgBoundaryCount: 0,
    tossWinBattingBias,
    lat: 0,
    lon: 0,
  };
}
