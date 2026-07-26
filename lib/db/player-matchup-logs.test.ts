import { describe, expect, it } from "vitest";
import { parseBowlerFromDismissal, matchBowlerNameToId } from "./player-matchup-logs";

describe("parseBowlerFromDismissal", () => {
  // Every string below is a REAL outdec value confirmed via live
  // scorecard testing earlier in this project (Ireland vs USA match),
  // not invented examples — this locks in behavior against actual
  // Cricbuzz dismissal-text conventions.
  it("parses lbw dismissals", () => {
    expect(parseBowlerFromDismissal("lbw b Nisarg Patel")).toBe("Nisarg Patel");
  });

  it("parses caught dismissals", () => {
    expect(parseBowlerFromDismissal("c Sushant Modani b Netravalkar")).toBe("Netravalkar");
  });

  it("parses plain bowled dismissals", () => {
    expect(parseBowlerFromDismissal("b Netravalkar")).toBe("Netravalkar");
  });

  it("parses caught-and-bowled dismissals, crediting the same player correctly", () => {
    expect(parseBowlerFromDismissal("c and b Curtis Campher")).toBe("Curtis Campher");
  });

  it("returns null for run outs — no bowler is credited for these", () => {
    expect(parseBowlerFromDismissal("run out (Monank Patel)")).toBeNull();
  });

  it("returns null for not outs", () => {
    expect(parseBowlerFromDismissal("not out")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseBowlerFromDismissal("")).toBeNull();
  });
});

describe("matchBowlerNameToId", () => {
  const bowlers = [
    { id: "1", name: "Saurabh Netravalkar" },
    { id: "2", name: "Ali Khan" },
    { id: "3", name: "Nisarg Patel" },
  ];

  it("matches an exact full name", () => {
    expect(matchBowlerNameToId("Nisarg Patel", bowlers)).toBe("3");
  });

  it("matches a shortened surname-only name against the full roster name", () => {
    expect(matchBowlerNameToId("Netravalkar", bowlers)).toBe("1");
  });

  it("returns null when no bowler in the roster plausibly matches", () => {
    expect(matchBowlerNameToId("Someone Else Entirely", bowlers)).toBeNull();
  });
});
