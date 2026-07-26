import { getCacheEntry } from "./api-cache";
import { isMongoConfigured } from "./mongodb";
import { MockCricketApiProvider } from "@/lib/cricket-api/mock-provider";
import type {
  HeadToHeadRecord,
  Player,
  PlayerStats,
  TeamFormEntry,
  UpcomingMatch,
  VenueStats,
} from "@/lib/cricket-api/types";

const mockProvider = new MockCricketApiProvider();

/**
 * Read-only data access for user-facing API routes. Per the architecture,
 * live requests must never call the external cricket API directly — only
 * the Vercel Cron refresh job does that, writing into Mongo. These
 * functions read whatever's currently cached and, if Mongo isn't
 * configured at all (local dev without an Atlas cluster set up yet),
 * transparently fall back to the mock provider so UI work never blocks
 * on infrastructure being provisioned.
 */

/**
 * The cache is only refreshed on demand (manual curl or Vercel Cron, if
 * re-enabled) — not continuously — so a match that was genuinely upcoming
 * when cached can still be sitting in Mongo with status "upcoming" well
 * after its real-world start time has passed. Filtering by startTime here
 * (rather than trusting the cached `status` field) keeps started/finished
 * matches from lingering in the UI until the next manual refresh happens
 * to overwrite them.
 */
function excludeStarted(matches: UpcomingMatch[]): UpcomingMatch[] {
  const now = Date.now();
  return matches.filter((m) => new Date(m.startTime).getTime() > now);
}

export async function getMatches(): Promise<UpcomingMatch[]> {
  const cached = await getCacheEntry<UpcomingMatch[]>("matches:upcoming");
  if (cached) return excludeStarted(cached.value);
  if (!isMongoConfigured()) return excludeStarted(await mockProvider.getUpcomingMatches());
  return [];
}

export async function getSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] } | null> {
  const cached = await getCacheEntry<{ teamA: Player[]; teamB: Player[] }>(`squad:${matchId}`);
  if (cached) return cached.value;
  if (!isMongoConfigured()) {
    try {
      return await mockProvider.getSquad(matchId);
    } catch {
      return null;
    }
  }
  return null;
}

export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const cached = await getCacheEntry<PlayerStats>(`player:${playerId}`);
  if (cached) return cached.value;
  if (!isMongoConfigured()) return mockProvider.getPlayerStats(playerId);
  return null;
}

export async function getVenue(venueId: string): Promise<VenueStats | null> {
  // Previously this always read the static mock venue file regardless of
  // which cricket provider was configured — meaning real Cricbuzz venue
  // IDs (numeric, e.g. "19") never matched the mock file's slug-style
  // IDs (e.g. "venue-wankhede"), so every real match silently got null
  // venue stats. Now checks real accumulated data (built from completed
  // match scorecards, same cost-free accumulator as player recentForm)
  // first, falling back to the mock file only for venues with no
  // accumulated history yet, or when Mongo isn't configured.
  const { getVenueStatsFromLogs } = await import("./venue-match-logs");
  const accumulated = await getVenueStatsFromLogs(venueId);
  if (accumulated) return accumulated;

  return mockProvider.getVenueStats(venueId);
}

export async function getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHeadRecord> {
  const key = `h2h:${[teamAId, teamBId].sort().join(":")}`;
  const cached = await getCacheEntry<HeadToHeadRecord>(key);
  if (cached) return cached.value;
  if (!isMongoConfigured()) return mockProvider.getHeadToHead(teamAId, teamBId);
  return { teamAId, teamBId, lastMeetings: [] };
}

export async function getTeamRecentForm(teamId: string): Promise<TeamFormEntry[]> {
  const cached = await getCacheEntry<TeamFormEntry[]>(`team-form:${teamId}`);
  if (cached) return cached.value;
  if (!isMongoConfigured()) return mockProvider.getTeamRecentForm(teamId);
  return [];
}
