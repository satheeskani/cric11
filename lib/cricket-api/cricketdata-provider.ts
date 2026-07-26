import venues from "@/data/venues.json";
import { hasBudgetRemaining, recordApiHit } from "@/lib/db/api-usage";
import type {
  CricketApiProvider,
  HeadToHeadRecord,
  MatchFormat,
  Player,
  PlayerRole,
  PlayerStats,
  TeamFormEntry,
  UpcomingMatch,
  VenueStats,
} from "./types";

const PROVIDER_NAME = "cricketdata";
const DAILY_HIT_LIMIT = 100;

const venueById = new Map<string, VenueStats>(
  (venues as VenueStats[]).map((v) => [v.id, v]),
);

/**
 * `matchType` is present for T20 matches but is often absent entirely on
 * ODI/Test entries from /v1/matches (verified against a live response —
 * not documented anywhere). Falling back to the human-readable `name`
 * field (e.g. "..., 3rd ODI, ...", "..., 2nd Test, ...") catches those
 * cases instead of silently mislabeling every non-T20 match as T20.
 */
function mapFormat(raw: string | undefined, name?: string): MatchFormat {
  const v = (raw ?? name ?? "").toLowerCase();
  if (v.includes("test")) return "Test";
  if (v.includes("odi")) return "ODI";
  return "T20";
}

function mapRole(raw: string | undefined): PlayerRole {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("keeper")) return "WK";
  if (v.includes("allrounder") || v.includes("all-rounder")) return "AR";
  if (v.includes("bowl")) return "BOWL";
  return "BAT";
}

/**
 * Credits run 7.0–10.5, scaled by role baseline and any recent-form
 * signal we have. CricketData.org's free tier doesn't return recent
 * per-innings numbers, so until our own `predictions`/scorecard history
 * (recorded match-by-match, see lib/accuracy) builds up, this falls back
 * to a flat role baseline in the middle of the range.
 */
function estimateCredits(role: PlayerRole, recentFormAvg: number | null): number {
  const roleBaseline: Record<PlayerRole, number> = { BAT: 8.5, WK: 8.0, AR: 8.5, BOWL: 8.0 };
  const base = roleBaseline[role];
  if (recentFormAvg === null) return base;

  // Nudge +/- up to 1.5 credits off the baseline based on recent form,
  // clamped to the 7.0-10.5 band used across the app.
  const nudge = Math.max(-1.5, Math.min(1.5, (recentFormAvg - 35) / 20));
  return Math.max(7.0, Math.min(10.5, Math.round((base + nudge) * 2) / 2));
}

/**
 * CricketData.org (the current brand of what used to be CricAPI —
 * same `api.cricapi.com` endpoints) provider. Requires CRICKETDATA_API_KEY.
 *
 * This class is only ever instantiated from the Vercel Cron refresh job
 * (app/api/cron/refresh-cricket-data/route.ts) — never from a user-facing
 * request — because the free tier is capped at 100 hits/day. Every call
 * checks and records against that budget in Mongo so a single cron run
 * can't burn through the whole day's quota.
 *
 * CricketData.org does not expose venue pitch reports or head-to-head
 * history, so those two methods fall back to the locally maintained
 * data/venues.json and an empty head-to-head record respectively. Verify
 * field names against the current docs before relying on this in
 * production — response shapes have changed across API versions.
 */
export class CricketDataProvider implements CricketApiProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const apiKey = process.env.CRICKETDATA_API_KEY;
    if (!apiKey) {
      throw new Error(
        "CRICKETDATA_API_KEY is not set. Add it to .env.local or set CRICKET_API_PROVIDER=mock.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = process.env.CRICKETDATA_BASE_URL ?? "https://api.cricapi.com/v1";
  }

  private async fetchJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const budgetOk = await hasBudgetRemaining(PROVIDER_NAME, DAILY_HIT_LIMIT);
    if (!budgetOk) {
      throw new Error(
        `CricketData.org daily hit budget (${DAILY_HIT_LIMIT}) exhausted — skipping request to ${path}.`,
      );
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("apikey", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString());
    await recordApiHit(PROVIDER_NAME);

    if (!res.ok) {
      throw new Error(`CricketData.org request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * /v1/matches is every match in CricketData.org's database — past and
   * future, ~16,000 rows at last check — paginated 25 at a time in an
   * order that has nothing to do with date proximity (verified live: page
   * 1/offset 0 came back full of matches 4-5 months out while much sooner
   * matches existed further in). Fetching a single page and returning it
   * unsorted, as the previous version did, could easily surface zero of
   * the matches actually happening in the next few days. Pulling a few
   * pages and sorting client-side is the fix; MATCH_PAGES caps it at 3
   * hits so a twice-daily cron run still stays well under the 100/day
   * budget.
   */
  async getUpcomingMatches(): Promise<UpcomingMatch[]> {
    const MATCH_PAGES = 3;
    const PAGE_SIZE = 25;
    const raw: any[] = [];
    for (let page = 0; page < MATCH_PAGES; page++) {
      const data = await this.fetchJson<{ data: any[] }>("/matches", {
        offset: String(page * PAGE_SIZE),
      });
      const batch = data.data ?? [];
      raw.push(...batch);
      if (batch.length < PAGE_SIZE) break; // fewer than a full page — no more to fetch
    }

    return raw
      .filter((m) => m.matchStarted === false || m.status === "Match not started")
      .map((m) => ({
        id: m.id,
        format: mapFormat(m.matchType, m.name),
        startTime: m.dateTimeGMT ?? m.date,
        status: "upcoming" as const,
        teamA: {
          id: m.teams?.[0] ?? "teamA",
          name: m.teams?.[0] ?? "Team A",
          shortName: m.teamInfo?.[0]?.shortname ?? m.teams?.[0] ?? "TBD",
          logoUrl: m.teamInfo?.[0]?.img ?? "",
        },
        teamB: {
          id: m.teams?.[1] ?? "teamB",
          name: m.teams?.[1] ?? "Team B",
          shortName: m.teamInfo?.[1]?.shortname ?? m.teams?.[1] ?? "TBD",
          logoUrl: m.teamInfo?.[1]?.img ?? "",
        },
        venueId: m.venueId ?? m.venue ?? "",
        venueName: m.venue ?? "TBD",
      }))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  async getSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] }> {
    const data = await this.fetchJson<{ data: any }>("/match_squad", { id: matchId });
    const squads = data.data ?? [];
    const toPlayers = (squad: any): Player[] =>
      (squad?.players ?? []).map((p: any) => {
        const role = mapRole(p.role);
        return {
          id: p.id,
          name: p.name,
          role,
          teamId: squad.shortname ?? squad.teamName ?? "",
          photoUrl: p.playerImg ?? "",
          battingStyle: p.battingStyle,
          bowlingStyle: p.bowlingStyle,
          credits: estimateCredits(role, null),
          recentForm: [],
        };
      });

    return {
      teamA: toPlayers(squads[0]),
      teamB: toPlayers(squads[1]),
    };
  }

  async getPlayerStats(playerId: string): Promise<PlayerStats> {
    await this.fetchJson<{ data: any }>("/players_info", { id: playerId });
    // CricketData.org's players_info returns career stats, not recent
    // per-venue or per-matchup breakdowns — surface an empty stats object
    // so the caller can gracefully skip venue/H2H scoring bonuses.
    return { playerId };
  }

  async getVenueStats(venueId: string): Promise<VenueStats | null> {
    return venueById.get(venueId) ?? null;
  }

  async getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHeadRecord> {
    return { teamAId, teamBId, lastMeetings: [] };
  }

  async getTeamRecentForm(_teamId: string): Promise<TeamFormEntry[]> {
    // No dedicated "team form" endpoint; deriving this reliably would mean
    // paging through completed series match lists per team, which isn't
    // worth the hit-budget cost. Left empty so the UI omits the recent
    // form strip rather than showing fabricated results — this gap
    // closes over time as our own `predictions` history accumulates.
    return [];
  }
}
