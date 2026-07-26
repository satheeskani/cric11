import { NextResponse } from "next/server";
import { checkRequiredEnvVars } from "@/lib/env";
import { getUsageThisMonth } from "@/lib/db/api-usage";

export const dynamic = "force-dynamic";

/**
 * Reports which required env vars (see lib/env.ts) are missing, by name
 * only — never their values. Meant to be checked after deploying (or
 * during local setup) so a misconfiguration shows up as one clear
 * checklist instead of scattered failures across different routes.
 *
 * Also reports current Cricbuzz RapidAPI usage for this UTC month, so
 * you can check remaining budget before deciding whether to run a
 * refresh — cheaper than finding out by hitting the 190 cap mid-request.
 */
export async function GET() {
  const { ok, missing } = checkRequiredEnvVars();

  let cricbuzzBudget: { usedThisMonth: number; limit: number } | null = null;
  try {
    const used = await getUsageThisMonth("cricbuzz");
    cricbuzzBudget = { usedThisMonth: used, limit: 190 };
  } catch {
    // Budget visibility is a nice-to-have, not required for health check
    // to succeed — Mongo being briefly unreachable shouldn't fail this.
  }

  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Missing required environment variable(s): ${missing.join(", ")}. See .env.local.example.`,
        missing,
        cricbuzzBudget,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, missing: [], cricbuzzBudget });
}
