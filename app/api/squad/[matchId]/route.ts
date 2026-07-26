import { NextResponse } from "next/server";
import { getSquad } from "@/lib/db/repository";

export async function GET(_req: Request, { params }: { params: { matchId: string } }) {
  const squad = await getSquad(params.matchId);
  if (!squad) {
    return NextResponse.json({ error: "Squad not yet synced for this match" }, { status: 404 });
  }
  return NextResponse.json(squad);
}
