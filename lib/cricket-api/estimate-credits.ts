import type { Player, RecentFormEntry } from "./types";

export const ROLE_CREDIT_BASELINE: Record<Player["role"], number> = { BAT: 8.5, WK: 8.0, AR: 8.5, BOWL: 8.0 };

/**
 * Nudges a role-baseline credit estimate by real recent form, clamped to
 * a realistic band. Providers assign the flat role baseline at the
 * initial squad fetch (no recentForm exists yet at that point), so this
 * is applied separately once enrichSquad has attached real recentForm —
 * without it, every player in a role costs exactly the same regardless
 * of actual output, which makes the credit cap barely constrain
 * anything and the "value" scoring factor nearly meaningless (a real
 * gap, not a hypothetical one — confirmed by reading the live provider
 * code, not assumed).
 */
export function recomputeCredits(role: Player["role"], recentForm: RecentFormEntry[]): number {
  const base = ROLE_CREDIT_BASELINE[role];
  if (recentForm.length === 0) return base;

  const avg = recentForm.reduce((sum, f) => sum + f.fantasyPoints, 0) / recentForm.length;
  // +/- up to 1.5 credits off the baseline, clamped to a 7.0-10.5 band —
  // same shape as the nudge formula already used by the CricketData
  // provider path, just now applied consistently regardless of which
  // provider originally fetched the squad.
  const nudge = Math.max(-1.5, Math.min(1.5, (avg - 35) / 20));
  return Math.max(7.0, Math.min(10.5, Math.round((base + nudge) * 2) / 2));
}
