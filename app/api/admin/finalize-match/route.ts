import { NextResponse } from "next/server";
import { finalizeMatch } from "@/lib/accuracy/predictions";
import { getSquad } from "@/lib/db/repository";

interface FinalizeBody {
  matchId: string;
  actualPoints: Record<string, number>;
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  // Deny by default when unset — matches the cron route's pattern.
  // The previous "allow when unset" default meant deploying without
  // setting ADMIN_SECRET left this endpoint open to anyone who found
  // the URL, letting them inject fake results into the public
  // /track-record page. Set ADMIN_SECRET in .env.local to use this route.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Manual trigger (per the brief — no live-scoring API in scope) to record
 * a completed match's actual per-player fantasy points and compute how
 * the predicted XI would have scored vs. a random valid XI. Feeds the
 * public /track-record page.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as FinalizeBody;
  if (!body?.matchId || !body?.actualPoints) {
    return NextResponse.json({ error: "matchId and actualPoints are required" }, { status: 400 });
  }

  const squad = await getSquad(body.matchId);
  if (!squad) {
    return NextResponse.json({ error: "Squad not found for this match" }, { status: 404 });
  }

  const result = await finalizeMatch(body.matchId, body.actualPoints, [...squad.teamA, ...squad.teamB]);
  if (!result) {
    return NextResponse.json({ error: "No prediction was logged for this match" }, { status: 404 });
  }

  return NextResponse.json(result);
}
