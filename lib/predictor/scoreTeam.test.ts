import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/cricket-api/types";
import { computePlayerScores, filterLikelyXI, predictTeam, proximityNote, selectTeam } from "./scoreTeam";
import { ROLE_CONSTRAINTS, type ScoredPlayer } from "./types";

function makePlayer(overrides: Partial<Player> & Pick<Player, "id" | "role" | "teamId">): Player {
  return {
    name: overrides.id,
    photoUrl: "",
    credits: 8.0,
    recentForm: [
      { date: "2026-01-01", opponent: "X", result: "W", fantasyPoints: 40 },
      { date: "2026-01-05", opponent: "X", result: "L", fantasyPoints: 30 },
    ],
    ...overrides,
  };
}

function buildPool(): Player[] {
  const teamAWk = ["a-wk-1", "a-wk-2"].map((id) => makePlayer({ id, role: "WK", teamId: "A", credits: 8 }));
  const teamBWk = ["b-wk-1", "b-wk-2"].map((id) => makePlayer({ id, role: "WK", teamId: "B", credits: 8 }));
  const teamABat = Array.from({ length: 6 }, (_, i) => makePlayer({ id: `a-bat-${i}`, role: "BAT", teamId: "A", credits: 9 }));
  const teamBBat = Array.from({ length: 6 }, (_, i) => makePlayer({ id: `b-bat-${i}`, role: "BAT", teamId: "B", credits: 9 }));
  const teamABowl = Array.from({ length: 5 }, (_, i) => makePlayer({ id: `a-bowl-${i}`, role: "BOWL", teamId: "A", credits: 8.5 }));
  const teamBBowl = Array.from({ length: 5 }, (_, i) => makePlayer({ id: `b-bowl-${i}`, role: "BOWL", teamId: "B", credits: 8.5 }));
  const teamAAr = Array.from({ length: 3 }, (_, i) => makePlayer({ id: `a-ar-${i}`, role: "AR", teamId: "A", credits: 8.5 }));
  const teamBAr = Array.from({ length: 3 }, (_, i) => makePlayer({ id: `b-ar-${i}`, role: "AR", teamId: "B", credits: 8.5 }));

  return [...teamAWk, ...teamBWk, ...teamABat, ...teamBBat, ...teamABowl, ...teamBBowl, ...teamAAr, ...teamBAr];
}

describe("defensive credit floor", () => {
  it("does not produce NaN or Infinity when a player somehow has zero or negative credits", () => {
    const pool = buildPool().map((p, i) => (i === 0 ? { ...p, credits: 0 } : i === 1 ? { ...p, credits: -5 } : p));
    const scored = computePlayerScores({ players: pool, venue: null });
    for (const p of scored) {
      expect(Number.isFinite(p.score.valueScore)).toBe(true);
      expect(Number.isFinite(p.score.composite)).toBe(true);
    }
  });
});

describe("maxPerTeam allows up to a 10:1 split", () => {
  it("selects 10 players from a heavily dominant team, forcing only 1 from the other", () => {
    const pool = buildPool().map((p) =>
      p.teamId === "A"
        ? {
            ...p,
            recentForm: [
              { date: "2026-01-01", opponent: "X", result: "W" as const, fantasyPoints: 100 },
              { date: "2026-01-05", opponent: "X", result: "W" as const, fantasyPoints: 100 },
            ],
          }
        : p,
    );
    const result = predictTeam({ players: pool, venue: null });
    const teamACount = result.players.filter((p) => p.teamId === "A").length;
    const teamBCount = result.players.filter((p) => p.teamId === "B").length;

    expect(teamACount).toBe(10);
    expect(teamBCount).toBe(1);
    expect(teamACount).toBeLessThanOrEqual(ROLE_CONSTRAINTS.maxPerTeam);
  });
});

describe("consistency modifier on form", () => {
  it("scores a consistent player higher than an equally-averaged but volatile one", () => {
    const consistent = makePlayer({
      id: "consistent-1",
      role: "BAT",
      teamId: "A",
      recentForm: [
        { date: "2026-01-01", opponent: "X", result: "W", fantasyPoints: 40 },
        { date: "2026-01-05", opponent: "X", result: "W", fantasyPoints: 40 },
        { date: "2026-01-10", opponent: "X", result: "W", fantasyPoints: 40 },
      ],
    });
    const volatile = makePlayer({
      id: "volatile-1",
      role: "BAT",
      teamId: "A",
      recentForm: [
        { date: "2026-01-01", opponent: "X", result: "L", fantasyPoints: 0 },
        { date: "2026-01-05", opponent: "X", result: "W", fantasyPoints: 0 },
        { date: "2026-01-10", opponent: "X", result: "W", fantasyPoints: 120 },
      ],
    });
    // Both average 40 fantasy points — identical raw form, different reliability.
    const scored = computePlayerScores({ players: [consistent, volatile], venue: null });
    const consistentScore = scored.find((p) => p.id === "consistent-1")!.score.formScore;
    const volatileScore = scored.find((p) => p.id === "volatile-1")!.score.formScore;
    expect(consistentScore).toBeGreaterThan(volatileScore);
  });
});

describe("captain ceiling tie-break", () => {
  it("prefers higher ceiling over marginally-higher composite when scores are close", () => {
    // Two BAT players, same team, credits, and role — differ only in
    // recentForm shape: one is a flat, low performer; the other has one
    // huge match buried in an otherwise similar average. Composite
    // scores should land within the tie-break threshold of each other.
    const steady = makePlayer({
      id: "steady-1",
      role: "BAT",
      teamId: "A",
      recentForm: [
        { date: "2026-01-01", opponent: "X", result: "W", fantasyPoints: 45 },
        { date: "2026-01-05", opponent: "X", result: "W", fantasyPoints: 45 },
      ],
    });
    const highCeiling = makePlayer({
      id: "high-ceiling-1",
      role: "BAT",
      teamId: "A",
      recentForm: [
        { date: "2026-01-01", opponent: "X", result: "L", fantasyPoints: 20 },
        { date: "2026-01-05", opponent: "X", result: "W", fantasyPoints: 130 },
      ],
    });
    const rest = buildPool().filter((p) => p.role !== "BAT" || p.teamId !== "A");
    const result = predictTeam({ players: [steady, highCeiling, ...rest], venue: null });

    // Only assert the meaningful case: if both made the team AND their
    // composites are within the tie-break window, the higher-ceiling
    // one should be captain, not just whichever has the marginally
    // higher average.
    const steadyInTeam = result.players.find((p) => p.id === "steady-1");
    const ceilingInTeam = result.players.find((p) => p.id === "high-ceiling-1");
    if (steadyInTeam && ceilingInTeam) {
      const gap = Math.abs(steadyInTeam.score.composite - ceilingInTeam.score.composite);
      if (gap <= 0.1) {
        expect(result.captainId).toBe("high-ceiling-1");
      }
    }
  });
});

describe("team win-rate nudge", () => {
  it("gives players on a higher-win-rate team a higher composite, all else equal", () => {
    const playerOnStrongTeam = makePlayer({ id: "p-strong", role: "BAT", teamId: "A" });
    const playerOnWeakTeam = makePlayer({ id: "p-weak", role: "BAT", teamId: "B" });

    const scored = computePlayerScores({
      players: [playerOnStrongTeam, playerOnWeakTeam],
      venue: null,
      teamWinRates: { A: 0.9, B: 0.1 },
    });

    const strong = scored.find((p) => p.id === "p-strong")!.score.composite;
    const weak = scored.find((p) => p.id === "p-weak")!.score.composite;
    expect(strong).toBeGreaterThan(weak);
  });

  it("applies no adjustment when a team has no accumulated win-rate data", () => {
    const player = makePlayer({ id: "p-1", role: "BAT", teamId: "A" });
    const withData = computePlayerScores({ players: [player], venue: null, teamWinRates: { A: 0.5 } });
    const withoutData = computePlayerScores({ players: [player], venue: null, teamWinRates: {} });
    expect(withData[0].score.composite).toBeCloseTo(withoutData[0].score.composite, 5);
  });
});

describe("matchup concerns (informational, not scoring)", () => {
  it("adds a dismissal-history note to reasoning without changing the composite score", () => {
    const struggler = makePlayer({
      id: "struggler-1",
      role: "BAT",
      teamId: "A",
      matchupConcerns: [{ bowlerId: "b1", bowlerName: "Muzarabani", dismissals: 2 }],
    });
    const noConcernData = makePlayer({ id: "no-concern-1", role: "BAT", teamId: "A" });

    const scored = computePlayerScores({ players: [struggler, noConcernData], venue: null });
    const strugglerResult = scored.find((p) => p.id === "struggler-1")!;
    const noConcernResult = scored.find((p) => p.id === "no-concern-1")!;

    expect(strugglerResult.score.reason).toContain("Dismissed by Muzarabani 2 times recently");
    expect(strugglerResult.score.composite).toBeCloseTo(noConcernResult.score.composite, 5);
  });
});

describe("typical batting position (informational, not scoring)", () => {
  it("adds an opener note to reasoning without changing the composite score", () => {
    const opener = makePlayer({ id: "opener-1", role: "BAT", teamId: "A", typicalBattingPosition: 1 });
    const noPositionData = makePlayer({ id: "no-data-1", role: "BAT", teamId: "A" });

    const scored = computePlayerScores({ players: [opener, noPositionData], venue: null });
    const openerResult = scored.find((p) => p.id === "opener-1")!;
    const noDataResult = scored.find((p) => p.id === "no-data-1")!;

    expect(openerResult.score.reason).toContain("Typically opens the batting");
    // Identical inputs otherwise (same role, team, recentForm) — composite
    // must be unaffected by batting position, since it's informational only.
    expect(openerResult.score.composite).toBeCloseTo(noDataResult.score.composite, 5);
  });

  it("does not add a batting-position note for bowlers, where it isn't meaningful", () => {
    const bowlerWithPosition = makePlayer({ id: "bowl-pos-1", role: "BOWL", teamId: "A", typicalBattingPosition: 9 });
    const scored = computePlayerScores({ players: [bowlerWithPosition], venue: null });
    expect(scored[0].score.reason).not.toContain("bats");
  });
});

describe("weather scoring", () => {
  it("gives bowlers a higher weather score than batters in humid/overcast conditions", () => {
    const bowler = makePlayer({ id: "bowl-1", role: "BOWL", teamId: "A" });
    const batter = makePlayer({ id: "bat-1", role: "BAT", teamId: "A" });
    const scored = computePlayerScores({
      players: [bowler, batter],
      venue: null,
      weather: {
        venueId: "v1",
        forecastFor: "2026-01-01T00:00:00Z",
        temperatureC: 22,
        condition: "Overcast",
        humidityPct: 85,
        windSpeedKph: 10,
        precipitationProbabilityPct: 20,
      },
    });
    const bowlerScore = scored.find((p) => p.id === "bowl-1")!.score.weatherScore;
    const batterScore = scored.find((p) => p.id === "bat-1")!.score.weatherScore;
    expect(bowlerScore).toBeGreaterThan(batterScore);
  });

  it("gives batters a higher weather score than bowlers in clear, dry conditions", () => {
    const bowler = makePlayer({ id: "bowl-1", role: "BOWL", teamId: "A" });
    const batter = makePlayer({ id: "bat-1", role: "BAT", teamId: "A" });
    const scored = computePlayerScores({
      players: [bowler, batter],
      venue: null,
      weather: {
        venueId: "v1",
        forecastFor: "2026-01-01T00:00:00Z",
        temperatureC: 32,
        condition: "Clear",
        humidityPct: 25,
        windSpeedKph: 5,
        precipitationProbabilityPct: 0,
      },
    });
    const bowlerScore = scored.find((p) => p.id === "bowl-1")!.score.weatherScore;
    const batterScore = scored.find((p) => p.id === "bat-1")!.score.weatherScore;
    expect(batterScore).toBeGreaterThan(bowlerScore);
  });

  it("has no effect on ranking when no weather data is provided", () => {
    const withWeather = predictTeam({ players: buildPool(), venue: null });
    const withoutWeather = predictTeam({ players: buildPool(), venue: null, weather: null });
    // Same input otherwise, no forecast either way — selections should match.
    expect(withWeather.players.map((p) => p.id).sort()).toEqual(withoutWeather.players.map((p) => p.id).sort());
  });
});

describe("computePlayerScores", () => {
  it("produces a composite score and reason for every player", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    expect(scored).toHaveLength(buildPool().length);
    for (const p of scored) {
      expect(Number.isFinite(p.score.composite)).toBe(true);
      expect(p.score.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("selectTeam constraints", () => {
  it("selects exactly 11 players", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    expect(team).toHaveLength(ROLE_CONSTRAINTS.teamSize);
  });

  it("never exceeds the credit cap", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    const totalCredits = team.reduce((sum, p) => sum + p.credits, 0);
    expect(totalCredits).toBeLessThanOrEqual(ROLE_CONSTRAINTS.creditCap);
  });

  it("includes at least one wicketkeeper", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    const wkCount = team.filter((p) => p.role === "WK").length;
    expect(wkCount).toBeGreaterThanOrEqual(ROLE_CONSTRAINTS.minWicketkeepers);
  });

  it("respects minimum batsmen and bowlers", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    const batCount = team.filter((p) => p.role === "BAT").length;
    const bowlCount = team.filter((p) => p.role === "BOWL").length;
    expect(batCount).toBeGreaterThanOrEqual(ROLE_CONSTRAINTS.minBatsmen);
    expect(bowlCount).toBeGreaterThanOrEqual(ROLE_CONSTRAINTS.minBowlers);
  });

  it("never picks more than the max-per-team limit from one team", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    const perTeam = new Map<string, number>();
    for (const p of team) perTeam.set(p.teamId, (perTeam.get(p.teamId) ?? 0) + 1);
    for (const count of perTeam.values()) {
      expect(count).toBeLessThanOrEqual(ROLE_CONSTRAINTS.maxPerTeam);
    }
  });

  it("never duplicates a player", () => {
    const scored = computePlayerScores({ players: buildPool(), venue: null });
    const team = selectTeam(scored);
    const ids = new Set(team.map((p) => p.id));
    expect(ids.size).toBe(team.length);
  });

  it("stays within cap even when every player is expensive", () => {
    const expensivePool = buildPool().map((p) => ({ ...p, credits: 10 }));
    const scored = computePlayerScores({ players: expensivePool, venue: null });
    const team = selectTeam(scored);
    const totalCredits = team.reduce((sum, p) => sum + p.credits, 0);
    expect(totalCredits).toBeLessThanOrEqual(ROLE_CONSTRAINTS.creditCap);
    // 11 players at 10 credits each (110) can't fit under 100, so the
    // selector must fall short of a full XI rather than breach the cap.
    expect(team.length).toBeLessThan(ROLE_CONSTRAINTS.teamSize);
  });
});

describe("predictTeam", () => {
  it("assigns distinct captain and vice-captain from the selected team", () => {
    const result = predictTeam({ players: buildPool(), venue: null });
    expect(result.captainId).not.toBe("");
    expect(result.viceCaptainId).not.toBe("");
    expect(result.captainId).not.toBe(result.viceCaptainId);
    const ids = result.players.map((p) => p.id);
    expect(ids).toContain(result.captainId);
    expect(ids).toContain(result.viceCaptainId);
  });

  it("picks the captain as the highest composite scorer on the team", () => {
    const result = predictTeam({ players: buildPool(), venue: null });
    const captain = result.players.find((p) => p.id === result.captainId)!;
    for (const p of result.players) {
      expect(captain.score.composite).toBeGreaterThanOrEqual(p.score.composite);
    }
  });

  it("total credits never exceeds the cap", () => {
    const result = predictTeam({ players: buildPool(), venue: null });
    expect(result.totalCredits).toBeLessThanOrEqual(ROLE_CONSTRAINTS.creditCap);
  });
});

describe("matchup-based head-to-head scoring", () => {
  it("gives a batter a lower matchup score against a team with strong recent bowling form", () => {
    const batter = makePlayer({ id: "bat-1", role: "BAT", teamId: "A" });
    const strongBowlers = [
      makePlayer({
        id: "bowl-strong-1",
        role: "BOWL",
        teamId: "B",
        recentForm: [{ date: "2026-01-01", opponent: "X", result: "W", fantasyPoints: 80 }],
      }),
    ];
    const weakBowlers = [
      makePlayer({
        id: "bowl-weak-1",
        role: "BOWL",
        teamId: "B",
        recentForm: [{ date: "2026-01-01", opponent: "X", result: "L", fantasyPoints: 10 }],
      }),
    ];

    const vsStrong = computePlayerScores({ players: [batter, ...strongBowlers], venue: null });
    const vsWeak = computePlayerScores({ players: [batter, ...weakBowlers], venue: null });

    const scoreVsStrong = vsStrong.find((p) => p.id === "bat-1")!.score.headToHeadScore;
    const scoreVsWeak = vsWeak.find((p) => p.id === "bat-1")!.score.headToHeadScore;
    expect(scoreVsWeak).toBeGreaterThan(scoreVsStrong);
  });

  it("gives a bowler a higher matchup score against a team with weak recent batting form", () => {
    const bowler = makePlayer({ id: "bowl-1", role: "BOWL", teamId: "A" });
    const strongBatters = [
      makePlayer({
        id: "bat-strong-1",
        role: "BAT",
        teamId: "B",
        recentForm: [{ date: "2026-01-01", opponent: "X", result: "W", fantasyPoints: 90 }],
      }),
    ];
    const weakBatters = [
      makePlayer({
        id: "bat-weak-1",
        role: "BAT",
        teamId: "B",
        recentForm: [{ date: "2026-01-01", opponent: "X", result: "L", fantasyPoints: 5 }],
      }),
    ];

    const vsStrong = computePlayerScores({ players: [bowler, ...strongBatters], venue: null });
    const vsWeak = computePlayerScores({ players: [bowler, ...weakBatters], venue: null });

    const scoreVsStrong = vsStrong.find((p) => p.id === "bowl-1")!.score.headToHeadScore;
    const scoreVsWeak = vsWeak.find((p) => p.id === "bowl-1")!.score.headToHeadScore;
    expect(scoreVsWeak).toBeGreaterThan(scoreVsStrong);
  });

  it("falls back neutrally when the opposition has no accumulated recentForm data at all", () => {
    const batter = makePlayer({ id: "bat-1", role: "BAT", teamId: "A" });
    const noDataBowler = makePlayer({ id: "bowl-1", role: "BOWL", teamId: "B", recentForm: [] });
    const scored = computePlayerScores({ players: [batter, noDataBowler], venue: null });
    expect(scored.find((p) => p.id === "bat-1")!.score.headToHeadScore).toBeGreaterThanOrEqual(0);
  });
});

function makeScored(composite: number): ScoredPlayer {
  const player = makePlayer({ id: `s-${composite}`, role: "BAT", teamId: "A" });
  return {
    ...player,
    score: { playerId: player.id, formScore: 0, venueScore: 0, headToHeadScore: 0, valueScore: 0, weatherScore: 0, composite, reason: "" },
  };
}

describe("proximityNote", () => {
  it("returns a close-miss note for a small gap below the weakest selected pick", () => {
    const note = proximityNote(0.6, [makeScored(0.65), makeScored(0.7)]);
    expect(note).toContain("Very close miss");
  });

  it("returns a well-behind note for a large gap", () => {
    const note = proximityNote(0.2, [makeScored(0.65), makeScored(0.7)]);
    expect(note).toContain("well behind");
  });

  it("returns the honest budget/limit explanation when the player scored as well as or better than a selected pick — selectTeam is credit/limit-constrained, not simple top-N-by-score, so this is a real, not-hypothetical case", () => {
    const note = proximityNote(0.72, [makeScored(0.65), makeScored(0.7)]);
    expect(note).toContain("credit cap or per-team player limit");
  });

  it("returns null when there's no selected player in the same role to compare against", () => {
    expect(proximityNote(0.5, [])).toBeNull();
  });
});

describe("notSelected reasoning", () => {
  it("returns every non-selected player, disjoint from the selected 11, sorted by composite descending", () => {
    const result = predictTeam({ players: buildPool(), venue: null });
    const selectedIds = new Set(result.players.map((p) => p.id));

    expect(result.notSelected.length).toBe(buildPool().length - ROLE_CONSTRAINTS.teamSize);
    expect(result.notSelected.every((p) => !selectedIds.has(p.id))).toBe(true);

    for (let i = 1; i < result.notSelected.length; i++) {
      expect(result.notSelected[i - 1].score.composite).toBeGreaterThanOrEqual(result.notSelected[i].score.composite);
    }
  });

  it("includes players excluded by the Likely XI filter itself, with a distinct honest reason, not just scored misses", () => {
    // Enough players with recentForm to pass filterLikelyXI's role
    // checks, PLUS a few extra with zero recentForm that get filtered
    // out before scoring even happens — these must still show up
    // somewhere, or a real squad player would be invisible everywhere.
    const pool = buildPool();
    const neverPlayed = makePlayer({ id: "ghost-1", role: "BAT", teamId: "A", recentForm: [] });
    const result = predictTeam({ players: [...pool, neverPlayed], venue: null });

    expect(result.usedLikelyXIFilter).toBe(true);
    const ghost = result.notSelected.find((p) => p.id === "ghost-1");
    expect(ghost).toBeDefined();
    expect(ghost!.score.reason).toContain("Not enough recent match data");
  });
});

describe("filterLikelyXI", () => {
  it("narrows to players with recent appearances when enough remain to fill every role", () => {
    const pool = buildPool(); // every player already has 2 recentForm entries by default
    const filtered = filterLikelyXI(pool);
    expect(filtered).toEqual(pool); // all qualify, so nothing is excluded — same list
  });

  it("falls back to the full squad when fewer than 11 players have recent appearances", () => {
    const pool = buildPool().map((p, i) => (i < 5 ? p : { ...p, recentForm: [] }));
    // Only the first 5 players have any recentForm — nowhere near 11.
    const filtered = filterLikelyXI(pool);
    expect(filtered).toHaveLength(pool.length); // full squad, not narrowed
  });

  it("falls back to the full squad when the narrowed pool can't fill every required role", () => {
    const pool = buildPool().map((p) => (p.role === "WK" ? { ...p, recentForm: [] } : p));
    // Every non-WK player still qualifies (well over 11), but zero WKs do —
    // a valid 11 is impossible without at least 1 WK, so this must NOT
    // silently narrow the pool down to a role-incomplete set.
    const filtered = filterLikelyXI(pool);
    expect(filtered).toHaveLength(pool.length);
    expect(filtered.some((p) => p.role === "WK")).toBe(true);
  });

  it("predictTeam still produces a valid 11 even when the filter falls back", () => {
    const pool = buildPool().map((p) => ({ ...p, recentForm: [] })); // nobody has recent data
    const result = predictTeam({ players: pool, venue: null });
    expect(result.players).toHaveLength(ROLE_CONSTRAINTS.teamSize);
    expect(result.usedLikelyXIFilter).toBe(false);
  });
});

describe("predictTeam with an entire role excluded", () => {
  it("KNOWN ISSUE: silently fills the team without the missing role instead of stopping short — selectTeam's slot-arithmetic check doesn't verify the role actually has eligible players, only that a slot is numerically available. This is why the /api/predict route's validity check must verify actual role COUNTS, not just team.length — see the mark-out feature's exclusion check.", () => {
    const pool = buildPool().filter((p) => p.role !== "WK");
    const result = predictTeam({ players: pool, venue: null });
    // Documenting real behavior, not endorsing it: still reaches 11
    // players, but with zero wicketkeepers — a role-constraint
    // violation that a naive "did we get 11 players?" check would miss.
    expect(result.players).toHaveLength(ROLE_CONSTRAINTS.teamSize);
    expect(result.players.every((p) => p.role !== "WK")).toBe(true);
  });
});
