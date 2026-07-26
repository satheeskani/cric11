import { NextResponse } from "next/server";
import { getCricketApiProvider } from "@/lib/cricket-api";
import { setCacheEntry } from "@/lib/db/api-cache";
import {
  getProcessedMatchIds,
  markMatchProcessed,
  saveMatchLogs,
  estimateBattingPoints,
  estimateBowlingPoints,
  type PlayerMatchLog,
} from "@/lib/db/player-match-logs";
import { saveVenueLog } from "@/lib/db/venue-match-logs";
import { saveTeamLog } from "@/lib/db/team-match-logs";

function resultForTeam(teamName: string, status: string): "W" | "L" | "NR" {
  const s = status.toLowerCase();
  if (s.includes("drawn") || s.includes("tied") || s.includes("abandoned") || s.includes("no result")) {
    return "NR";
  }
  return s.includes(teamName.toLowerCase()) && s.includes("won") ? "W" : "L";
}

function buildMatchLogEntries(
  scorecard: any,
  match: { matchId: string; team1Name: string; team2Name: string; status: string; seriesName?: string },
): PlayerMatchLog[] {
  const entries: PlayerMatchLog[] = [];
  const date = new Date().toISOString();

  for (const innings of scorecard.scorecard ?? []) {
    const battingTeam = innings.batteamname as string;
    const opponent = battingTeam === match.team1Name ? match.team2Name : match.team1Name;
    const result = resultForTeam(battingTeam, match.status);

    for (const b of innings.batsman ?? []) {
      entries.push({
        playerId: String(b.id),
        matchId: match.matchId,
        date,
        opponent,
        result,
        runsScored: b.runs,
        fantasyPoints: estimateBattingPoints(b.runs, b.fours, b.sixes),
        seriesName: match.seriesName,
      });
    }
    for (const bw of innings.bowler ?? []) {
      entries.push({
        playerId: String(bw.id),
        matchId: match.matchId,
        date,
        opponent: battingTeam,
        result: resultForTeam(opponent, match.status),
        wicketsTaken: bw.wickets,
        fantasyPoints: estimateBowlingPoints(bw.wickets, bw.maidens ?? 0),
        seriesName: match.seriesName,
      });
    }
  }
  return entries;
}

/**
 * Zero extra API cost — derives each team's W/L/NR purely from the
 * match status text already present in the same completed-match
 * summary the player/venue accumulators use, no scorecard or extra
 * fetch needed.
 */
async function saveTeamLogsFromMatch(match: {
  matchId: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  status: string;
}): Promise<void> {
  const date = new Date().toISOString();
  if (match.team1Id) {
    await saveTeamLog({ teamId: match.team1Id, matchId: match.matchId, result: resultForTeam(match.team1Name, match.status), date });
  }
  if (match.team2Id) {
    await saveTeamLog({ teamId: match.team2Id, matchId: match.matchId, result: resultForTeam(match.team2Name, match.status), date });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Manual (or Vercel Cron, if re-enabled) entry point — the only place
 * allowed to call the external cricket API provider. User-facing routes
 * read exclusively from the Mongo cache this populates
 * (lib/db/repository.ts).
 *
 * Pass ?matchId=X to refresh only that one match — the intended way to
 * call this day-to-day, since it keeps a single run's cost to roughly
 * 1 (match list) + 3 (squad) + up to 4 (log accumulator) requests,
 * regardless of how many matches are upcoming overall. Omitting matchId
 * falls back to refreshing every match within a 5-day horizon, which is
 * far more expensive (confirmed: 13-17 requests per run for even a
 * handful of matches) — only use that mode if you're intentionally
 * pre-warming several matches at once and have budget to spare.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetMatchId = new URL(req.url).searchParams.get("matchId");

  const provider = getCricketApiProvider();
  const log: string[] = [];

  let matches;
  try {
    matches = await provider.getUpcomingMatches();
    await setCacheEntry("matches:upcoming", matches);
    log.push(`matches: cached ${matches.length}`);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to refresh matches: ${(err as Error).message}`, log },
      { status: 502 },
    );
  }

  let upcoming;
  if (targetMatchId) {
    upcoming = matches.filter((m) => m.id === targetMatchId);
    if (upcoming.length === 0) {
      return NextResponse.json(
        { error: `matchId ${targetMatchId} not found in current upcoming matches`, log },
        { status: 404 },
      );
    }
  } else {
    const horizonMs = 5 * 24 * 60 * 60 * 1000;
    upcoming = matches
      .filter((m) => new Date(m.startTime).getTime() - Date.now() < horizonMs)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  const squadsByMatchId = new Map<string, { teamA: Awaited<ReturnType<typeof provider.getSquad>>["teamA"]; teamB: Awaited<ReturnType<typeof provider.getSquad>>["teamB"] }>();

  for (const match of upcoming) {
    try {
      const squad = await provider.getSquad(match.id);
      const { getRecentFormForSeries } = await import("@/lib/db/player-match-logs");
      for (const player of [...squad.teamA, ...squad.teamB]) {
        player.recentForm = await getRecentFormForSeries(player.id, match.seriesName, 5);
      }
      squadsByMatchId.set(match.id, squad);
      await setCacheEntry(`squad:${match.id}`, squad);
      log.push(`squad ${match.id}: cached`);
    } catch (err) {
      log.push(`squad ${match.id}: FAILED - ${(err as Error).message}`);
      continue;
    }

    try {
      const h2h = await provider.getHeadToHead(match.teamA.id, match.teamB.id);
      await setCacheEntry(`h2h:${[match.teamA.id, match.teamB.id].sort().join(":")}`, h2h);
    } catch (err) {
      log.push(`h2h ${match.id}: FAILED - ${(err as Error).message}`);
    }

    for (const teamId of [match.teamA.id, match.teamB.id]) {
      try {
        const form = await provider.getTeamRecentForm(teamId);
        await setCacheEntry(`team-form:${teamId}`, form);
      } catch (err) {
        log.push(`team-form ${teamId}: FAILED - ${(err as Error).message}`);
      }
    }
  }

  const nextMatch = upcoming[0];
  if (nextMatch) {
    try {
      // Reuse the squad already fetched (and cached) above instead of
      // calling getSquad a second time for the same match — this used
      // to be a redundant extra request every single run.
      const squadEntry = squadsByMatchId.get(nextMatch.id);
      if (!squadEntry) throw new Error("squad fetch failed earlier in this run, skipping player stats");
      const allPlayers = [...squadEntry.teamA, ...squadEntry.teamB];
      for (const player of allPlayers) {
        try {
          const stats = await provider.getPlayerStats(player.id);
          await setCacheEntry(`player:${player.id}`, stats);
        } catch (err) {
          log.push(`player ${player.id}: FAILED - ${(err as Error).message}`);
          break; // budget likely exhausted; stop spending requests
        }
      }
      log.push(`player stats: attempted for ${allPlayers.length} players in ${nextMatch.id}`);
    } catch (err) {
      log.push(`player stats prefetch skipped: ${(err as Error).message}`);
    }
  }

  try {
    const provider2 = provider as unknown as {
      getRecentCompletedMatches?: () => Promise<
        {
          matchId: string;
          seriesName: string;
          team1Name: string;
          team2Name: string;
          team1Id: string;
          team2Id: string;
          status: string;
          venueId: string;
        }[]
      >;
      getMatchScorecard?: (matchId: string) => Promise<any>;
      getMatchTossInfo?: (matchId: string) => Promise<{ decision: string } | null>;
    };
    if (provider2.getRecentCompletedMatches && provider2.getMatchScorecard) {
      const processed = await getProcessedMatchIds();
      const completed = await provider2.getRecentCompletedMatches();
      const newOnes = completed.filter((m) => !processed.has(m.matchId)).slice(0, 3);

      for (const m of newOnes) {
        try {
          const scorecard = await provider2.getMatchScorecard(m.matchId);
          const entries = buildMatchLogEntries(scorecard, m);
          await saveMatchLogs(entries);

          // Team win-rate: zero extra cost, reuses the status text
          // already in `m` from getRecentCompletedMatches.
          await saveTeamLogsFromMatch(m);

          // Toss bias: a genuinely separate API call (see
          // getMatchTossInfo's doc comment). Wrapped in its own
          // try/catch so a failure here doesn't lose the player/team
          // logs already saved above for this match.
          let tossDecision: string | undefined;
          if (provider2.getMatchTossInfo) {
            try {
              const toss = await provider2.getMatchTossInfo(m.matchId);
              tossDecision = toss?.decision;
            } catch (tossErr) {
              log.push(`toss info ${m.matchId}: FAILED - ${(tossErr as Error).message}`);
            }
          }

          const innings = scorecard.scorecard ?? [];
          await saveVenueLog({
            venueId: m.venueId,
            matchId: m.matchId,
            date: new Date().toISOString(),
            firstInningsRuns: innings[0]?.score,
            secondInningsRuns: innings[1]?.score,
            tossDecision,
          });

          await markMatchProcessed(m.matchId);
          log.push(
            `match log ${m.matchId}: saved ${entries.length} player entries + venue log + team log` +
              (tossDecision ? " + toss info" : ""),
          );
        } catch (err) {
          log.push(`match log ${m.matchId}: FAILED - ${(err as Error).message}`);
          break;
        }
      }
    }
  } catch (err) {
    log.push(`match log accumulation skipped: ${(err as Error).message}`);
  }

  return NextResponse.json({ ok: true, refreshedMatches: upcoming.length, log });
}
