import { NextResponse } from "next/server";
import { getTrackRecord } from "@/lib/accuracy/predictions";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = await getTrackRecord();

  const beatRandomCount = records.filter((r) => (r.edge ?? 0) > 0).length;
  const summary = {
    totalFinalized: records.length,
    beatRandomCount,
    beatRandomRate: records.length > 0 ? beatRandomCount / records.length : null,
    averageEdge:
      records.length > 0 ? records.reduce((sum, r) => sum + (r.edge ?? 0), 0) / records.length : null,
  };

  return NextResponse.json({ records, summary });
}
