import { getCricketApiProvider } from "@/lib/cricket-api";
import { setCacheEntry } from "@/lib/db/api-cache";
import type { UpcomingMatch, Player } from "@/lib/cricket-api/types";
import { getRecentFormForSeries, getTypicalBattingPosition } from "@/lib/db/player-match-logs";
import { getMatchupConcerns } from "@/lib/db/player-matchup-logs";

/**
 * Attaches real recentForm, typicalBattingPosition, and matchupConcerns
 * to every player in a squad — pure Mongo reads, zero API cost. Shared
 * between the cron route (which already has `match` in scope from its
 * own earlier getUpcomingMatches call) and the on-demand fetch below, so
 * this enrichment logic only lives in one place.
 */
export async function enrichSquad(
  squad: { teamA: Player[]; teamB: Player[] },
  match: Pick<UpcomingMatch, "seriesName">,
): Promise<void> {
  const teamABowlers = squad.teamA
    .filter((p) => p.role === "BOWL" || p.role === "AR")
    .map((p) => ({ id: p.id, name: p.name }));
  const teamBBowlers = squad.teamB
    .filter((p) => p.role === "BOWL" || p.role === "AR")
    .map((p) => ({ id: p.id, name: p.name }));

  for (const player of [...squad.teamA, ...squad.teamB]) {
    player.recentForm = await getRecentFormForSeries(player.id, match.seriesName, 5);
    const typicalPosition = await getTypicalBattingPosition(player.id);
    if (typicalPosition != null) player.typicalBattingPosition = typicalPosition;

    if (player.role === "BAT" || player.role === "WK" || player.role === "AR") {
      const isTeamA = squad.teamA.some((p) => p.id === player.id);
      const opposingBowlers = isTeamA ? teamBBowlers : teamABowlers;
      const concerns = await getMatchupConcerns(player.id, opposingBowlers);
      if (concerns.length > 0) player.matchupConcerns = concerns;
    }
  }
}

/**
 * Full on-demand flow, used ONLY by app/api/squad/[matchId]/route.ts's
 * "fetch on first view" behavior — this is a deliberate, narrowly-scoped
 * exception to the app's core rule that only the cron route calls the
 * external cricket API. It's safe specifically because:
 *   1. The caller must check Mongo first and only invoke this when the
 *      squad genuinely isn't cached yet — never on every page load.
 *   2. The budget guard lives inside the provider itself (fetchJson),
 *      so it's enforced regardless of which route calls it.
 *
 * Must call getUpcomingMatches() first, in this same invocation — the
 * Cricbuzz provider's squad lookup depends on an in-memory series cache
 * that only getUpcomingMatches() populates, and that cache doesn't
 * persist across separate serverless invocations (each request may be
 * a fresh cold start). This costs one extra request beyond the squad
 * fetch itself, same as the cron route's existing pattern.
 */
export async function fetchAndCacheSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] } | null> {
  const provider = getCricketApiProvider();

  const matches = await provider.getUpcomingMatches();
  await setCacheEntry("matches:upcoming", matches);

  const match = matches.find((m) => m.id === matchId);
  if (!match) return null; // not currently upcoming — started, ended, or an unknown id

  const squad = await provider.getSquad(matchId);
  await enrichSquad(squad, match);
  await setCacheEntry(`squad:${matchId}`, squad);
  return squad;
}
