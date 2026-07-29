import { NextResponse } from "next/server";
import { getSquad } from "@/lib/db/repository";
import { fetchAndCacheSquad } from "@/lib/cricket-api/fetch-and-cache-squad";

export async function GET(_req: Request, { params }: { params: { matchId: string } }) {
  const cached = await getSquad(params.matchId);
  if (cached) return NextResponse.json(cached);

  // Not cached yet — fetch on first view. This is a deliberate,
  // narrowly-scoped exception to "only the cron route calls the
  // external API": it only fires on a genuine cache miss (never on
  // every page load, since the check above always runs first), and the
  // budget guard inside the provider itself still applies regardless of
  // which route triggers it.
  try {
    const squad = await fetchAndCacheSquad(params.matchId);
    if (!squad) {
      return NextResponse.json(
        { error: "This match isn't currently upcoming — it may have started, ended, or the id is wrong." },
        { status: 404 },
      );
    }
    return NextResponse.json(squad);
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch squad live: ${(err as Error).message}` }, { status: 502 });
  }
}
