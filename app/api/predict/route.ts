import { NextResponse } from "next/server";
import { getMatches, getPlayerStats, getSquad, getVenue } from "@/lib/db/repository";
import { getCacheEntry, isStale, setCacheEntry, TTL } from "@/lib/db/api-cache";
import { logPrediction } from "@/lib/accuracy/predictions";
import { predictTeam } from "@/lib/predictor/scoreTeam";
import { ROLE_CONSTRAINTS } from "@/lib/predictor/types";
import { fetchWeatherForecast } from "@/lib/weather/openweather-provider";
import { getTeamWinRate } from "@/lib/db/team-match-logs";
import type { PredictorWeights } from "@/lib/predictor/types";
import type { HeadToHeadHint, VenueHint } from "@/lib/predictor/types";
import type { WeatherForecast } from "@/lib/weather/types";

interface PredictRequestBody {
  matchId: string;
  weights?: Partial<PredictorWeights>;
  /** Player IDs to exclude from selection entirely — the "mark as out,
   * re-pick" override for when you've checked the real lineup elsewhere
   * and know someone isn't playing, which this app has no way to detect
   * on its own (no lineup feed exists at this data tier). */
  excludedPlayerIds?: string[];
}

export async function POST(req: Request) {
  let body: PredictRequestBody;
  try {
    body = (await req.json()) as PredictRequestBody;
  } catch {
    // Malformed or empty request body — this must never reach a bare
    // 500. Every other error path in this route returns a clean
    // {error: ...} response; this is the same contract for the one
    // that happens before we even have a parsed body to inspect.
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body?.matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }
  if (body.excludedPlayerIds !== undefined && !Array.isArray(body.excludedPlayerIds)) {
    // Previously a non-array value here (e.g. a raw string) silently
    // did nothing — new Set("9406") splits it into individual
    // characters, which then never match any real player id, so
    // "excluded" players stayed on the team with zero indication
    // anything was wrong. Reject it explicitly instead.
    return NextResponse.json({ error: "excludedPlayerIds must be an array of strings" }, { status: 400 });
  }

  const [matches, squad] = await Promise.all([getMatches(), getSquad(body.matchId)]);

  const match = matches.find((m) => m.id === body.matchId);
  if (!match) {
    return NextResponse.json({ error: `Unknown matchId: ${body.matchId}` }, { status: 404 });
  }
  if (!squad) {
    return NextResponse.json({ error: "Squad not yet synced for this match" }, { status: 404 });
  }

  const venue = await getVenue(match.venueId);
  const excluded = new Set(body.excludedPlayerIds ?? []);
  const allPlayers = [...squad.teamA, ...squad.teamB].filter((p) => !excluded.has(p.id));
  const perPlayerStats = await Promise.all(allPlayers.map((p) => getPlayerStats(p.id)));

  const venueHints: VenueHint[] = perPlayerStats
    .filter((s): s is NonNullable<typeof s> => !!s?.venuePerformance)
    .map((s) => ({
      playerId: s.playerId,
      average: s.venuePerformance!.average,
      strikeRate: s.venuePerformance!.strikeRate,
    }));

  const headToHeadHints: HeadToHeadHint[] = perPlayerStats
    .filter((s): s is NonNullable<typeof s> => !!s?.headToHeadPerformance)
    .map((s) => ({
      playerId: s.playerId,
      fantasyPointsAvg: s.headToHeadPerformance!.fantasyPointsAvg,
    }));

  // Real weather, fetched here for the first time (previously only ever
  // fetched for the UI weather card that's since been removed — never
  // actually reached the scorer). Uses match.venueLat/venueLon, which
  // Cricbuzz's response carries but was previously discarded. Skipped
  // gracefully (weather stays null) if coordinates aren't available for
  // this match's venue, or if the fetch fails for any reason — weather
  // is a scoring enhancement, not a requirement for a prediction to work.
  let weather: WeatherForecast | null = null;
  if (match.venueLat != null && match.venueLon != null) {
    const dateBucket = new Date(match.startTime).toISOString().slice(0, 10);
    const cacheKey = `weather:${match.venueId}:${dateBucket}`;
    try {
      const cached = await getCacheEntry<WeatherForecast>(cacheKey);
      if (cached && !isStale(cached.cachedAt, TTL.WEATHER_MS)) {
        weather = cached.value;
      } else {
        weather = await fetchWeatherForecast(
          match.venueId,
          match.venueLat,
          match.venueLon,
          new Date(match.startTime),
        );
        if (weather) await setCacheEntry(cacheKey, weather);
      }
    } catch {
      // Swallow — see comment above.
    }
  }

  // Real team win rates — cheap Mongo reads (no API cost), used as a
  // mild composite nudge, not a primary scoring factor. Missing entries
  // (no accumulated decisive results for a team yet) simply mean no
  // adjustment for that team's players.
  const [teamAWinRate, teamBWinRate] = await Promise.all([
    getTeamWinRate(match.teamA.id),
    getTeamWinRate(match.teamB.id),
  ]);
  const teamWinRates: Record<string, number> = {};
  if (teamAWinRate != null) teamWinRates[match.teamA.id] = teamAWinRate;
  if (teamBWinRate != null) teamWinRates[match.teamB.id] = teamBWinRate;

  const result = predictTeam({
    players: allPlayers,
    venue,
    venueHints,
    headToHeadHints,
    weights: body.weights,
    weather,
    teamWinRates,
  });

  const roleCounts = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const p of result.players) roleCounts[p.role]++;
  const meetsRoleMinimums =
    roleCounts.WK >= ROLE_CONSTRAINTS.minWicketkeepers &&
    roleCounts.BAT >= ROLE_CONSTRAINTS.minBatsmen &&
    roleCounts.BOWL >= ROLE_CONSTRAINTS.minBowlers &&
    roleCounts.AR >= ROLE_CONSTRAINTS.minAllRounders;

  if (result.players.length < ROLE_CONSTRAINTS.teamSize || !meetsRoleMinimums) {
    // Excluding these players made a valid 11 impossible — e.g. every
    // wicketkeeper in the squad got marked out. Checking role counts
    // directly, not just team length: predictTeam can still return
    // exactly 11 players while silently missing a required role
    // entirely (a known edge case in the selection algorithm's slot
    // arithmetic), so length alone isn't a reliable signal here.
    return NextResponse.json(
      {
        error:
          "Can't build a valid 11 with these players excluded — a required role (wicketkeeper, batter, bowler, or all-rounder) has no eligible players left. Restore at least one excluded player from that role.",
      },
      { status: 422 },
    );
  }

  await logPrediction(body.matchId, result, body.weights);

  return NextResponse.json(result);
}
