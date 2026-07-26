import { getDb, isMongoConfigured } from "./mongodb";

const COLLECTION = "team_match_logs";

export interface TeamMatchLog {
  teamId: string;
  matchId: string;
  result: "W" | "L" | "NR";
  date: string;
}

interface TeamMatchLogDoc extends TeamMatchLog {
  _id: string;
}

/**
 * Costs ZERO extra API calls — the W/L/NR result for a team is already
 * derivable from the same completed-match status text
 * (getRecentCompletedMatches) that the player/venue accumulators
 * already fetch. This is a different read of data already in hand.
 */
export async function saveTeamLog(entry: TeamMatchLog): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  const _id = `${entry.teamId}:${entry.matchId}`;
  await db
    .collection<TeamMatchLogDoc>(COLLECTION)
    .updateOne({ _id }, { $set: { ...entry, _id } }, { upsert: true });
}

/**
 * Real recent win rate for a team, from accumulated match results.
 * Excludes "NR" (no-result/abandoned/tied) from the denominator since
 * those aren't wins or losses. Returns null until at least one W or L
 * has been logged — an honest "no signal yet", not a fabricated 50/50.
 */
export async function getTeamWinRate(teamId: string): Promise<number | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  const logs = await db.collection<TeamMatchLogDoc>(COLLECTION).find({ teamId }).toArray();
  const decisive = logs.filter((l) => l.result === "W" || l.result === "L");
  if (decisive.length === 0) return null;
  return decisive.filter((l) => l.result === "W").length / decisive.length;
}
