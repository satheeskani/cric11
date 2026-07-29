import { getCricketApiProvider } from "@/lib/cricket-api";
import { setCacheEntry } from "@/lib/db/api-cache";
import type { UpcomingMatch } from "@/lib/cricket-api/types";

/**
 * Fetches the current upcoming-matches list live and caches it — the
 * same "fetch on genuine cache miss" pattern used for squads (see
 * lib/cricket-api/fetch-and-cache-squad.ts). Costs 1 real request, no
 * squad fetching involved. Used by /api/matches when the cached list is
 * empty (e.g. every previously-cached match has since started, so
 * excludeStarted() filters everything out) — without this, the app
 * could show "no upcoming matches" indefinitely even when real matches
 * exist, until someone manually ran the cron endpoint.
 */
export async function fetchAndCacheMatches(): Promise<UpcomingMatch[]> {
  const provider = getCricketApiProvider();
  const matches = await provider.getUpcomingMatches();
  await setCacheEntry("matches:upcoming", matches);
  return matches;
}
