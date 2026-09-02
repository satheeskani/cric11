import { describe, expect, it } from "vitest";
import { recomputeCredits, ROLE_CREDIT_BASELINE } from "./estimate-credits";
import type { RecentFormEntry } from "./types";

function makeForm(points: number[]): RecentFormEntry[] {
  return points.map((fantasyPoints, i) => ({
    date: `2026-01-0${i + 1}`,
    opponent: "X",
    result: "W" as const,
    fantasyPoints,
  }));
}

describe("recomputeCredits", () => {
  it("returns the flat role baseline when there's no recentForm yet", () => {
    expect(recomputeCredits("BAT", [])).toBe(ROLE_CREDIT_BASELINE.BAT);
    expect(recomputeCredits("BOWL", [])).toBe(ROLE_CREDIT_BASELINE.BOWL);
  });

  it("nudges credits up for a player with strong recent form", () => {
    const strongForm = makeForm([90, 85, 95]);
    const credits = recomputeCredits("BAT", strongForm);
    expect(credits).toBeGreaterThan(ROLE_CREDIT_BASELINE.BAT);
  });

  it("nudges credits down for a player with weak recent form", () => {
    const weakForm = makeForm([2, 5, 0]);
    const credits = recomputeCredits("BOWL", weakForm);
    expect(credits).toBeLessThan(ROLE_CREDIT_BASELINE.BOWL);
  });

  it("clamps to the 7.0-10.5 band regardless of how extreme the form is", () => {
    const extremelyHighForm = makeForm([500, 500, 500]);
    const extremelyLowForm = makeForm([0, 0, 0]);
    expect(recomputeCredits("AR", extremelyHighForm)).toBeLessThanOrEqual(10.5);
    expect(recomputeCredits("AR", extremelyLowForm)).toBeGreaterThanOrEqual(7.0);
  });

  it("gives two same-role players different credits when their real form differs", () => {
    const star = recomputeCredits("BAT", makeForm([80, 75, 90]));
    const fringe = recomputeCredits("BAT", makeForm([5, 8, 3]));
    // The entire point of this fix: same role no longer means same price.
    expect(star).toBeGreaterThan(fringe);
  });
});
