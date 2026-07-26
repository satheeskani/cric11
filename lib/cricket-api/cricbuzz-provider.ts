import venues from "@/data/venues.json";
import { ALLOWED_TOURNAMENTS } from "@/config/tournaments";
import { hasMonthlyBudgetRemaining, recordApiHitMonthly } from "@/lib/db/api-usage";
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

const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";

/**
 * Kept below the actual 200/month RapidAPI cap as a safety margin — the
 * app has other reasons to fail gracefully (a slow month-end) rather
 * than sprint right up to the hard limit and risk a mid-run 429.
 */
const MONTHLY_REQUEST_LIMIT = 190;

const venueById = new Map<string, VenueStats>(
  (venues as VenueStats[]).map((v) => [v.id, v]),
);

function mapFormat(raw: string | undefined): MatchFormat {
  const v = (raw ?? "").toUpperCase();
  if (v.includes("TEST")) return "Test";
  if (v.includes("ODI")) return "ODI";
  return "T20";
}

function isAllowedTournament(seriesName: string): boolean {
  const name = seriesName.toLowerCase();
  return ALLOWED_TOURNAMENTS.some((t) => name.includes(t.toLowerCase()));
}

/**
 * Cricbuzz's `series/get-players` role strings, verified live against
 * "The Hundred Men's Competition 2026" (seriesId 11493, squadId 15821):
 * "Batsman", "Batting Allrounder", "Bowling Allrounder", "WK-Batsman",
 * "Bowler". Both allrounder variants collapse to AR — the app doesn't
 * currently distinguish batting-first vs bowling-first allrounders.
 */
function mapRole(raw: string | undefined): PlayerRole {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("wk")) return "WK";
  if (v.includes("allrounder")) return "AR";
  if (v.includes("bowler")) return "BOWL";
  return "BAT";
}

/**
 * Same credit-estimation approach as CricketDataProvider — Cricbuzz's
 * free tier doesn't expose recent per-innings form either, so this is a
 * flat role baseline until lib/accuracy's own prediction history builds
 * up enough data to replace it.
 */
function estimateCredits(role: PlayerRole): number {
  const roleBaseline: Record<PlayerRole, number> = { BAT: 8.5, WK: 8.0, AR: 8.5, BOWL: 8.0 };
  return roleBaseline[role];
}

interface MatchSeriesLookup {
  seriesId: string;
  team1Id: string;
  team2Id: string;
}

interface CompletedMatchSummary {
  matchId: string;
  seriesName: string;
  team1Name: string;
  team2Name: string;
  team1Id: string;
  team2Id: string;
  status: string;
  venueId: string;
}

/**
 * Cricbuzz Cricket API (RapidAPI, host cricbuzz-cricket.p.rapidapi.com).
 * Requires RAPIDAPI_KEY. This is an unofficial, community-published
 * wrapper around Cricbuzz's own backend — not a documented public
 * contract like CricketData.org — so field names here are based on
 * live responses verified during setup (see comments below), not
 * official docs. Re-verify if requests start failing after a while;
 * unofficial wrappers can change shape without notice.
 *
 * Endpoint chain (three hits per match to get full squads, so this is
 * meant for personal/low-volume use — the RapidAPI Basic plan caps at
 * 200 requests/month):
 *   matches/upcoming          -> matches grouped by series, with seriesId
 *   series/get-squads?seriesId=X -> one entry per team, with squadId
 *   series/get-players?squadId=Y -> individual players for that team
 */
export class CricbuzzProvider implements CricketApiProvider {
  private apiKey: string;

  /**
   * Populated by getUpcomingMatches() and read by getSquad() within the
   * same request lifecycle (see app/api/cron/refresh-cricket-data,
   * which always calls getUpcomingMatches before getSquad on the same
   * provider instance). Cricbuzz's squad endpoints are series-scoped,
   * not match-scoped, so this is how a matchId gets back to a seriesId
   * without an extra API call per match.
   */
  private matchSeriesCache = new Map<string, MatchSeriesLookup>();

  constructor() {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error(
        "RAPIDAPI_KEY is not set. Add it to .env.local or set CRICKET_API_PROVIDER=mock.",
      );
    }
    this.apiKey = apiKey;
  }

  private async fetchJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const hasBudget = await hasMonthlyBudgetRemaining("cricbuzz", MONTHLY_REQUEST_LIMIT);
    if (!hasBudget) {
      throw new Error(
        `Cricbuzz monthly request budget (${MONTHLY_REQUEST_LIMIT}) reached — refusing to call ${path}. ` +
          `Resets at the start of next UTC month, or upgrade the RapidAPI plan and raise MONTHLY_REQUEST_LIMIT.`,
      );
    }

    const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": this.apiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
    });
    // Record the hit regardless of success/failure — RapidAPI counts the
    // request against quota either way, so a string of failed calls
    // should still trip the budget guard rather than looking free.
    await recordApiHitMonthly("cricbuzz");

    if (!res.ok) {
      throw new Error(`Cricbuzz request failed: ${res.status} ${res.statusText} (${path})`);
    }
    return res.json();
  }

  /**
   * Verified live shape (matches/upcoming): { typeMatches: [{ matchType,
   * seriesMatches: [{ seriesAdWrapper: { seriesId, seriesName, matches:
   * [{ matchInfo: { matchId, seriesId, ... } }] } }] }] }.
   * matchInfo's team1/team2/venue/date field names below are NOT yet
   * verified against a live response for this specific project — the
   * shape above was confirmed, but the individual matchInfo fields are
   * based on common documented usage of this API elsewhere. If matches
   * come back with missing teams/venue/time, log a raw matchInfo object
   * and adjust the field names here.
   */
  async getUpcomingMatches(): Promise<UpcomingMatch[]> {
    const data = await this.fetchJson<{ typeMatches: any[] }>("/matches/v1/upcoming");
    const results: UpcomingMatch[] = [];

    for (const typeMatch of data.typeMatches ?? []) {
      for (const seriesMatch of typeMatch.seriesMatches ?? []) {
        const wrapper = seriesMatch.seriesAdWrapper;
        if (!wrapper) continue;
        if (!isAllowedTournament(wrapper.seriesName ?? "")) continue;

        for (const m of wrapper.matches ?? []) {
          const info = m.matchInfo;
          if (!info) continue;

          const matchId = String(info.matchId);
          const team1Id = String(info.team1?.teamId ?? "");
          const team2Id = String(info.team2?.teamId ?? "");

          this.matchSeriesCache.set(matchId, {
            seriesId: String(wrapper.seriesId),
            team1Id,
            team2Id,
          });

          results.push({
            id: matchId,
            format: mapFormat(info.matchFormat),
            startTime: info.startDate
              ? new Date(Number(info.startDate)).toISOString()
              : new Date().toISOString(),
            status: "upcoming",
            teamA: {
              id: team1Id,
              name: info.team1?.teamName ?? "Team A",
              shortName: info.team1?.teamSName ?? info.team1?.teamName ?? "TBD",
              logoUrl: "",
            },
            teamB: {
              id: team2Id,
              name: info.team2?.teamName ?? "Team B",
              shortName: info.team2?.teamSName ?? info.team2?.teamName ?? "TBD",
              logoUrl: "",
            },
            venueId: String(info.venueInfo?.id ?? ""),
            venueName: info.venueInfo?.ground ?? "TBD",
            venueLat: info.venueInfo?.latitude ? parseFloat(info.venueInfo.latitude) : undefined,
            venueLon: info.venueInfo?.longitude ? parseFloat(info.venueInfo.longitude) : undefined,
            seriesName: wrapper.seriesName,
          });
        }
      }
    }

    return results.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }

  /**
   * Same parsing shape as getUpcomingMatches (both /matches/upcoming and
   * /matches/recent return the identical typeMatches->seriesMatches
   * structure — verified live), filtered to only completed matches in
   * allowed tournaments. Used by the match-log accumulator, not by any
   * user-facing route.
   */
  async getRecentCompletedMatches(): Promise<CompletedMatchSummary[]> {
    const data = await this.fetchJson<{ typeMatches: any[] }>("/matches/v1/recent");
    const results: CompletedMatchSummary[] = [];

    for (const typeMatch of data.typeMatches ?? []) {
      for (const seriesMatch of typeMatch.seriesMatches ?? []) {
        const wrapper = seriesMatch.seriesAdWrapper;
        if (!wrapper) continue;
        if (!isAllowedTournament(wrapper.seriesName ?? "")) continue;

        for (const m of wrapper.matches ?? []) {
          const info = m.matchInfo;
          if (!info || info.state !== "Complete") continue;

          results.push({
            matchId: String(info.matchId),
            seriesName: wrapper.seriesName,
            team1Name: info.team1?.teamName ?? "Team A",
            team2Name: info.team2?.teamName ?? "Team B",
            team1Id: String(info.team1?.teamId ?? ""),
            team2Id: String(info.team2?.teamId ?? ""),
            status: info.status ?? "",
            venueId: String(info.venueInfo?.id ?? ""),
          });
        }
      }
    }
    return results;
  }

  /**
   * Verified live at /mcenter/v1/{matchId}/scard (the spec's original
   * /matches/get-scorecard?matchId=X 404s — same class of bug as the
   * original squads endpoints: match-scoped detail lives under mcenter,
   * as a path segment, not a top-level matches/ query param).
   * Raw scorecard passthrough — shape documented in the accumulator that consumes it.
   */
  async getMatchScorecard(matchId: string): Promise<any> {
    return this.fetchJson<any>(`/mcenter/v1/${matchId}/scard`);
  }

  /**
   * A GENUINELY NEW API call beyond what the accumulator already
   * fetched for scorecards — toss data lives at a different endpoint
   * (matches/recent's matchInfo has no tossresults field; it only
   * appears in mcenter/v1/{id}/leanback's matchheaders, verified live
   * earlier). This means the toss-bias accumulator costs one extra
   * request per NEWLY completed match, on top of the scorecard fetch —
   * roughly doubling that specific line item, though still bounded by
   * the same 3-matches-per-run cap the rest of the accumulator uses.
   */
  async getMatchTossInfo(matchId: string): Promise<{ decision: string } | null> {
    const data = await this.fetchJson<{ matchheaders?: { tossresults?: { decision?: string } } }>(
      `/mcenter/v1/${matchId}/leanback`,
    );
    const decision = data.matchheaders?.tossresults?.decision;
    return decision ? { decision } : null;
  }

  /**
   * Verified live shapes (both seriesId and squadId are URL path segments,
   * not query params — the RapidAPI console's auto-generated snippet used
   * query params, which 404s; the actual routes are path-based):
   *   GET /series/v1/{seriesId}/squads -> { squads: [{ isHeader: true,
   *     squadType } | { squadId, squadType (team name), imageId, teamId }] }
   *   GET /series/v1/{seriesId}/squads/{squadId} -> { player: [{ isHeader:
   *     true, name } | { id, name, role, imageId, battingStyle,
   *     bowlingStyle?, captain? }] }
   * Both endpoints interleave section-header rows (isHeader: true) with
   * real entries in the same array — those get filtered out below.
   */
  async getSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] }> {
    const lookup = this.matchSeriesCache.get(matchId);
    if (!lookup) {
      throw new Error(
        `No cached series info for matchId ${matchId} — getUpcomingMatches() must be called ` +
          `first in the same request so the series-scoped squad lookup has something to key off.`,
      );
    }

    const squadsData = await this.fetchJson<{ squads: any[] }>(
      `/series/v1/${lookup.seriesId}/squads`,
    );
    const teamSquads = (squadsData.squads ?? []).filter((s) => !s.isHeader);

    const findSquadId = (teamId: string) =>
      teamSquads.find((s) => String(s.teamId) === teamId)?.squadId;

    const fetchTeamPlayers = async (teamId: string): Promise<Player[]> => {
      const squadId = findSquadId(teamId);
      if (!squadId) return [];

      const playersData = await this.fetchJson<{ player: any[] }>(
        `/series/v1/${lookup.seriesId}/squads/${squadId}`,
      );

      return (playersData.player ?? [])
        .filter((p) => !p.isHeader)
        .map((p): Player => {
          const role = mapRole(p.role);
          return {
            id: String(p.id),
            name: p.name,
            role,
            teamId,
            photoUrl: "",
            battingStyle: p.battingStyle,
            bowlingStyle: p.bowlingStyle,
            credits: estimateCredits(role),
            recentForm: [],
          };
        });
    };

    const [teamA, teamB] = await Promise.all([
      fetchTeamPlayers(lookup.team1Id),
      fetchTeamPlayers(lookup.team2Id),
    ]);

    return { teamA, teamB };
  }

  /**
   * Not yet wired to a Cricbuzz stats endpoint — the "players" endpoint
   * category (series/get-players is squad-listing only) likely has a
   * dedicated per-player stats call, but it wasn't checked during setup.
   * Returns an empty stats object so venue/H2H scoring bonuses are
   * gracefully skipped, same fallback CricketDataProvider uses.
   */
  async getPlayerStats(playerId: string): Promise<PlayerStats> {
    return { playerId };
  }

  async getVenueStats(venueId: string): Promise<VenueStats | null> {
    return venueById.get(venueId) ?? null;
  }

  async getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHeadRecord> {
    return { teamAId, teamBId, lastMeetings: [] };
  }

  async getTeamRecentForm(_teamId: string): Promise<TeamFormEntry[]> {
    return [];
  }
}
