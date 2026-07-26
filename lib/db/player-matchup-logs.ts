import { getDb, isMongoConfigured } from "./mongodb";

const COLLECTION = "player_matchup_logs";

export interface PlayerMatchupLog {
  batterId: string;
  bowlerId: string;
  matchId: string;
  date: string;
}

interface PlayerMatchupLogDoc extends PlayerMatchupLog {
  _id: string;
}

/**
 * Parses a Cricbuzz `outdec` dismissal string (e.g. "lbw b Nisarg Patel",
 * "c Sushant Modani b Netravalkar", "c and b Curtis Campher") to extract
 * the credited bowler's name. Matches the LAST " b NAME" (or a leading
 * "b NAME" for plain bowled dismissals) in the string — this is the
 * consistent convention across caught/bowled/lbw/stumped/hit-wicket
 * dismissals. Deliberately does NOT match "run out (...)" or "not out",
 * since neither credits a bowler and both correctly fail this pattern
 * (verified against real examples from this project's earlier live
 * testing). Returns null for anything that doesn't match — an honest
 * "couldn't parse this one," not a forced guess.
 */
export function parseBowlerFromDismissal(outdec: string): string | null {
  const match = outdec.match(/(?:^|\s)b\s+([A-Za-z .'-]+)$/);
  return match ? match[1].trim() : null;
}

/**
 * Matches a (possibly shortened) name from a dismissal string against
 * the real bowler roster for that innings (which has actual player
 * IDs). Prefers an exact match, falls back to substring match in either
 * direction (handles "Netravalkar" matching "Saurabh Netravalkar").
 * Returns null if no bowler in the roster plausibly matches — safer to
 * skip a matchup log entry than mis-attribute a dismissal to the wrong
 * player.
 */
export function matchBowlerNameToId(
  dismissalName: string,
  bowlers: { id: string; name: string }[],
): string | null {
  const normalized = dismissalName.toLowerCase().trim();
  const exact = bowlers.find((b) => b.name.toLowerCase().trim() === normalized);
  if (exact) return exact.id;

  const partial = bowlers.find(
    (b) => b.name.toLowerCase().includes(normalized) || normalized.includes(b.name.toLowerCase()),
  );
  return partial ? partial.id : null;
}

export async function saveMatchupLog(entry: PlayerMatchupLog): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  const _id = `${entry.batterId}:${entry.bowlerId}:${entry.matchId}`;
  await db
    .collection<PlayerMatchupLogDoc>(COLLECTION)
    .updateOne({ _id }, { $set: { ...entry, _id } }, { upsert: true });
}

export interface MatchupConcern {
  bowlerId: string;
  bowlerName: string;
  dismissals: number;
}

const MIN_DISMISSALS_TO_SURFACE = 2;

/**
 * For a batter, checks accumulated dismissal history against a specific
 * list of opposing bowlers (today's actual opposing team) — NOT a
 * general "who dismisses this batter most" query, since only today's
 * real opponents are relevant to a specific match. Only surfaces a
 * concern once a bowler has dismissed this batter at least
 * MIN_DISMISSALS_TO_SURFACE times — a single dismissal is easily
 * coincidence, not a real pattern.
 *
 * Honest limitation: this counts DISMISSALS only, not "times faced
 * without being dismissed" (scorecards don't give per-ball
 * bowler-facing detail), so this can't express a true success/failure
 * rate — only "X has gotten Y out N times recently." Treat it as a
 * real, specific caution, not a statistical rate.
 */
export async function getMatchupConcerns(
  batterId: string,
  opposingBowlers: { id: string; name: string }[],
): Promise<MatchupConcern[]> {
  if (!isMongoConfigured() || opposingBowlers.length === 0) return [];
  const db = await getDb();
  const bowlerIds = opposingBowlers.map((b) => b.id);
  const logs = await db
    .collection<PlayerMatchupLogDoc>(COLLECTION)
    .find({ batterId, bowlerId: { $in: bowlerIds } })
    .toArray();

  const countByBowler = new Map<string, number>();
  for (const log of logs) {
    countByBowler.set(log.bowlerId, (countByBowler.get(log.bowlerId) ?? 0) + 1);
  }

  const nameById = new Map(opposingBowlers.map((b) => [b.id, b.name]));
  return Array.from(countByBowler.entries())
    .filter(([, count]) => count >= MIN_DISMISSALS_TO_SURFACE)
    .map(([bowlerId, dismissals]) => ({
      bowlerId,
      bowlerName: nameById.get(bowlerId) ?? "this bowler",
      dismissals,
    }))
    .sort((a, b) => b.dismissals - a.dismissals);
}
