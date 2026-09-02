import type { Player } from "@/lib/cricket-api/types";
import {
  DEFAULT_WEIGHTS,
  ROLE_CONSTRAINTS,
  type PlayerScoreBreakdown,
  type PredictedTeamResult,
  type PredictorInput,
  type PredictorWeights,
  type ScoredPlayer,
} from "./types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const WINSORIZE_MIN_POOL_SIZE = 4;
const WINSORIZE_STD_DEVS = 2;

/**
 * Clips values beyond +/-2 standard deviations from the pool mean before
 * min-max scaling — a single freak performance (e.g. one 150-fantasy-
 * point outlier in a squad of otherwise 20-40 point players) would
 * otherwise stretch the whole 0-1 scale and compress everyone else's
 * real differences toward 0. Skipped for pools under
 * WINSORIZE_MIN_POOL_SIZE, since there isn't enough data to distinguish
 * a genuine outlier from normal variance at that size, and clipping
 * could do more harm than good.
 */
function winsorize(values: number[]): number[] {
  if (values.length < WINSORIZE_MIN_POOL_SIZE) return values;
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return values;
  const lower = mean - WINSORIZE_STD_DEVS * stdDev;
  const upper = mean + WINSORIZE_STD_DEVS * stdDev;
  return values.map((v) => Math.min(upper, Math.max(lower, v)));
}

function minMaxNormalize(values: number[]): number[] {
  const clipped = winsorize(values);
  const min = Math.min(...clipped);
  const max = Math.max(...clipped);
  if (max === min) return clipped.map(() => 0.5);
  return clipped.map((v) => (v - min) / (max - min));
}

/**
 * Recency-weighted, not a flat average — a player 3-for-3 in their last
 * 3 knocks and quiet before that should rank above one with the same
 * average shaped the other way. player.recentForm is already sorted
 * most-recent-first (see the .sort({date: -1}) in the accumulator that
 * populates it), so index 0 gets the highest linear weight.
 */
function recentFormRaw(player: Player): number {
  const form = player.recentForm;
  if (form.length === 0) return 0;
  const weights = form.map((_, i) => form.length - i);
  const weightedSum = form.reduce((sum, f, i) => sum + f.fantasyPoints * weights[i], 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weightedSum / totalWeight;
}

const SHRINKAGE_FULL_CONFIDENCE_MATCHES = 5;

/**
 * Regresses a player's raw form average toward the pool's mean form,
 * proportionally to how little data backs it up — a player with exactly
 * 1 tracked match otherwise gets that single score trusted at full
 * strength, so a fluke 90-point knock reads identically to a genuinely
 * proven 90-point average. Standard empirical-Bayes shrinkage: full
 * confidence (no shrinkage) once a player has SHRINKAGE_FULL_CONFIDENCE_MATCHES
 * tracked matches, linearly less trust below that, blended with the
 * pool's own mean rather than an arbitrary constant so the "regression
 * target" is itself real, current data.
 */
function shrinkTowardPoolMean(rawValue: number, sampleSize: number, poolMean: number): number {
  const confidence = Math.min(sampleSize / SHRINKAGE_FULL_CONFIDENCE_MATCHES, 1);
  return rawValue * confidence + poolMean * (1 - confidence);
}

/**
 * How reliable a player's recent form actually is, not just its average
 * — a player scoring 20/20/20/20/20 and one scoring 0/0/0/0/100 have
 * identical averages but very different risk profiles. Uses inverse
 * coefficient of variation (stdDev/mean), mapped to (0, 1], higher =
 * more consistent. Returns a neutral 0.5 with fewer than 2 data points
 * or a non-positive mean — not enough signal to judge consistency
 * either way, honest neutral rather than a fabricated read.
 */
function recentFormConsistency(player: Player): number {
  const points = player.recentForm.map((f) => f.fantasyPoints);
  if (points.length < 2) return 0.5;
  const mean = average(points);
  if (mean <= 0) return 0.5;
  const variance = average(points.map((p) => (p - mean) ** 2));
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;
  return 1 / (1 + coefficientOfVariation);
}

/**
 * A player's single best recent performance — used only for
 * captain/vice-captain tie-breaking (see pickCaptainAndViceCaptain),
 * where upside genuinely matters more than average, since the
 * captain's points get doubled. Returns 0 with no recent data, which
 * naturally deprioritizes them for a ceiling-based tie-break without
 * excluding them from the team itself.
 */
function recentFormCeiling(player: Player): number {
  if (player.recentForm.length === 0) return 0;
  return Math.max(...player.recentForm.map((f) => f.fantasyPoints));
}

function venueFitRaw(player: Player, input: PredictorInput): number {
  const hint = input.venueHints?.find((h) => h.playerId === player.id);
  if (hint) return hint.average * 0.6 + hint.strikeRate * 0.4;

  // No historical venue data for this player: fall back to a neutral
  // score derived from the venue's overall scoring profile so batting-
  // friendly venues still nudge batters/all-rounders up a little.
  if (!input.venue) return 50;
  const pitchBonus: Record<string, Partial<Record<Player["role"], number>>> = {
    batting: { BAT: 10, AR: 5, WK: 8, BOWL: -5 },
    bowling: { BOWL: 10, AR: 5, BAT: -5, WK: -3 },
    "spin-friendly": { BOWL: 6, AR: 3 },
    "pace-friendly": { BOWL: 6, AR: 3 },
    balanced: {},
  };
  const bonus = pitchBonus[input.venue.pitchType]?.[player.role] ?? 0;

  // Real toss-bias signal (was computed and stored but never read until
  // now — a genuine bug, not a missing feature). This does NOT tell us
  // who won TODAY's actual toss (unknowable at this API tier) — only
  // the venue's historical tendency. A venue where toss winners
  // strongly prefer batting first (>0.6) suggests conditions ease early
  // and toughen later — small additional bowler nudge. The reverse
  // (<0.4) suggests the opposite. Deliberately small, and only applied
  // outside a 0.4-0.6 neutral band, since this reinforces the existing
  // pitch-type signal rather than introducing an independent one.
  const toss = input.venue.tossWinBattingBias;
  const tossBonusTable: Partial<Record<Player["role"], number>> =
    toss > 0.6 ? { BOWL: 4, AR: 2 } : toss < 0.4 ? { BAT: 4, AR: 2, WK: 3 } : {};
  const tossBonus = tossBonusTable[player.role] ?? 0;

  return input.venue.avgFirstInningsScore / 10 + bonus + tossBonus;
}

/**
 * Aggregate real recent bowling/batting strength for one team, from
 * accumulated recentForm data — average fantasy points among that
 * team's players in the given role group, counting only players who
 * actually have accumulated match history. Returns 0 (honest "no
 * signal yet") if nobody in that role group has any recentForm data.
 */
function computeTeamStrength(players: Player[], teamId: string, roles: Player["role"][]): number {
  const relevant = players.filter(
    (p) => p.teamId === teamId && roles.includes(p.role) && p.recentForm.length > 0,
  );
  if (relevant.length === 0) return 0;
  return average(relevant.map((p) => average(p.recentForm.map((f) => f.fantasyPoints))));
}

/**
 * Matchup-specific adjustment, not just generic conditions: a batter
 * facing a team whose bowlers have genuinely been strong recently
 * (real accumulated recentForm data) faces a tougher matchup than one
 * facing a weaker attack — even under identical weather/pitch. Same
 * idea in reverse for bowlers against strong/weak opposing batting.
 * All-rounders get a smaller, blended adjustment either way. Falls
 * back to real per-player head-to-head data if that's ever populated
 * (it currently isn't, at this API tier), then to the player's own
 * damped recent form if there's no data on the opposition at all yet —
 * same honest-neutral pattern used everywhere else in this file.
 */
function headToHeadRaw(
  player: Player,
  input: PredictorInput,
  bowlingStrengthByTeam: Map<string, number>,
  battingStrengthByTeam: Map<string, number>,
): number {
  const hint = input.headToHeadHints?.find((h) => h.playerId === player.id);
  if (hint) return hint.fantasyPointsAvg;

  const ownForm = recentFormRaw(player) * 0.8;
  const opponentTeamId = input.players.find((p) => p.teamId !== player.teamId)?.teamId;
  if (!opponentTeamId) return ownForm;

  const oppBowling = bowlingStrengthByTeam.get(opponentTeamId) ?? 0;
  const oppBatting = battingStrengthByTeam.get(opponentTeamId) ?? 0;
  if (oppBowling === 0 && oppBatting === 0) return ownForm; // no accumulated data on this opponent yet

  if (player.role === "BAT" || player.role === "WK") {
    return ownForm - oppBowling * 0.3; // stronger opposing bowling => tougher matchup
  }
  if (player.role === "BOWL") {
    return ownForm - oppBatting * 0.2; // stronger opposing batting => harder to contain/dismiss
  }
  // AR: smaller, blended effect from both sides of the matchup.
  return ownForm - (oppBowling * 0.15 + oppBatting * 0.1) / 2;
}

/**
 * Rule-based, not AI — a real forecast (fetched by the caller and passed
 * in via input.weather) nudges role fit: high humidity or an
 * overcast/rainy forecast favors bowlers (more seam/swing assistance in
 * practice); clear, dry conditions favor batters. This is a simplified
 * heuristic, not a meteorological or cricket-analytics model — treat the
 * bonus/penalty as directional, not precise. Returns a neutral 50 (same
 * for every player, so it has zero effect on relative ranking) when no
 * forecast is available, same graceful-degradation pattern as venue fit.
 */
function weatherFitRaw(player: Player, input: PredictorInput): number {
  const weather = input.weather;
  if (!weather) return 50;

  const overcastOrWet = /cloud|overcast|rain|drizzle|shower/i.test(weather.condition);
  const bowlerFriendly = weather.humidityPct > 70 || overcastOrWet;
  const batterFriendly = weather.humidityPct < 40 && !overcastOrWet;

  const bonus: Partial<Record<Player["role"], number>> = bowlerFriendly
    ? { BOWL: 10, AR: 5, BAT: -5, WK: -3 }
    : batterFriendly
      ? { BAT: 8, AR: 4, WK: 5, BOWL: -4 }
      : {};

  return 50 + (bonus[player.role] ?? 0);
}

const ROTATION_RISK_DAYS = 21;

/**
 * Real, computable from data already in hand — no new accumulator or
 * API call needed. player.recentForm is already sorted most-recent-
 * first, so its first entry's date is the last tracked appearance.
 * Deliberately descriptive, not speculative: reports the gap as a fact
 * ("hasn't appeared recently"), never guesses a cause (injury, rest,
 * tournament break between competitions are all equally plausible and
 * indistinguishable from this data alone).
 */
function daysSinceLastAppearance(player: Player): number | null {
  const lastDate = player.recentForm[0]?.date;
  if (!lastDate) return null;
  return Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
}

function isLeftHandedBat(battingStyle?: string): boolean {
  return !!battingStyle?.toLowerCase().includes("left");
}

/**
 * Well-established general spin-vs-handedness cricket principle, not
 * exhaustive analysis — real exceptions exist for individual players.
 * Off-spin turns away from a left-handed batter (tougher for LHB);
 * leg-spin and left-arm orthodox both turn away from a right-handed
 * batter (tougher for RHB). Deliberately excludes pace-vs-handedness
 * matchups, where the angle/swing effect is less universally agreed
 * upon and riskier to encode confidently.
 */
function isToughSpinMatchup(bowlingStyle: string | undefined, isLHB: boolean): boolean {
  const style = bowlingStyle?.toLowerCase() ?? "";
  const isOffSpin = style.includes("off break") || style.includes("offbreak") || style.includes("off-break");
  const isLegSpinOrLeftArmOrthodox =
    style.includes("leg break") ||
    style.includes("legbreak") ||
    style.includes("leg-break") ||
    style.includes("left-arm orthodox") ||
    style.includes("left arm orthodox");
  if (isOffSpin) return isLHB;
  if (isLegSpinOrLeftArmOrthodox) return !isLHB;
  return false;
}

/**
 * Finds real opposing bowlers whose style creates a historically tough
 * matchup against this batter's hand — see isToughSpinMatchup's doc
 * comment for the specific, deliberately-scoped rule being applied.
 */
function findToughStyleMatchupBowlers(player: Player, allPlayers: Player[]): string[] {
  if (player.role !== "BAT" && player.role !== "WK" && player.role !== "AR") return [];
  const isLHB = isLeftHandedBat(player.battingStyle);
  const opposing = allPlayers.filter((p) => p.teamId !== player.teamId && (p.role === "BOWL" || p.role === "AR"));
  return opposing.filter((b) => isToughSpinMatchup(b.bowlingStyle, isLHB)).map((b) => b.name);
}

function reasonFor(
  player: Player,
  breakdown: Omit<PlayerScoreBreakdown, "reason">,
  styleMatchupBowlers: string[] = [],
): string {
  const parts: string[] = [];
  const form = player.recentForm;
  const fifties = form.filter((f) => (f.runsScored ?? 0) >= 50).length;
  const wickets = form.reduce((sum, f) => sum + (f.wicketsTaken ?? 0), 0);

  if (fifties > 0) parts.push(`In-form: ${fifties} fifty${fifties > 1 ? "s" : ""} in last ${form.length} innings`);
  if (wickets > 0) parts.push(`${wickets} wickets in last ${form.length} matches`);
  if (breakdown.venueScore > 0.65) parts.push("Strong fit for this venue's conditions");
  if (breakdown.weatherScore > 0.65) parts.push("Favorable conditions in today's forecast");
  if (breakdown.headToHeadScore > 0.65) parts.push("Favorable matchup against this opposition");
  if (breakdown.headToHeadScore < 0.35) parts.push("Facing a strong opposition attack this match");
  if (breakdown.valueScore > 0.65) parts.push("Good value for the credit cost");

  // Informational only — historical tendency, not today's confirmed
  // order, and deliberately excluded from the composite score (see
  // Player.typicalBattingPosition's doc comment for why).
  const pos = player.typicalBattingPosition;
  if (pos != null && (player.role === "BAT" || player.role === "WK" || player.role === "AR")) {
    if (pos <= 2) parts.push("Typically opens the batting");
    else if (pos <= 4) parts.push("Typically bats in the top order");
    else if (pos <= 7) parts.push("Typically bats in the middle order");
    else parts.push("Typically bats late in the order");
  }

  // Real player-vs-player dismissal history against TODAY's actual
  // opponent — informational only, same reasoning as batting position:
  // counts dismissals, not a true faced-vs-dismissed rate, so it's a
  // real caution rather than a score-moving statistic.
  const concern = player.matchupConcerns?.[0];
  if (concern) {
    parts.push(`Dismissed by ${concern.bowlerName} ${concern.dismissals} times recently`);
  }

  // Real, computed from data already in hand — see daysSinceLastAppearance's
  // doc comment for why this is deliberately descriptive, not speculative.
  const gap = daysSinceLastAppearance(player);
  if (gap != null && gap >= ROTATION_RISK_DAYS) {
    parts.push(`Hasn't appeared in a tracked match in ${gap}+ days`);
  }

  // Well-established general spin-vs-handedness principle — see
  // isToughSpinMatchup's doc comment for the specific rule and its
  // deliberate scope (spin only, not pace).
  if (styleMatchupBowlers.length > 0) {
    parts.push(`Faces a historically tricky matchup vs ${styleMatchupBowlers[0]}'s bowling style`);
  }

  if (parts.length === 0) parts.push("Solid all-round composite score");

  return parts.join(" · ");
}

export function computePlayerScores(input: PredictorInput): ScoredPlayer[] {
  const weights: PredictorWeights = { ...DEFAULT_WEIGHTS, ...input.weights };
  const { players } = input;

  const teamIds = Array.from(new Set(players.map((p) => p.teamId)));
  const bowlingStrengthByTeam = new Map(
    teamIds.map((id) => [id, computeTeamStrength(players, id, ["BOWL", "AR"])]),
  );
  const battingStrengthByTeam = new Map(
    teamIds.map((id) => [id, computeTeamStrength(players, id, ["BAT", "WK", "AR"])]),
  );

  // Shrink each player's raw form toward the pool's mean, proportional to
  // how little data backs it up (see shrinkTowardPoolMean's doc comment)
  // — computed once here so both the form pillar AND the value pillar
  // below use the same de-noised figure, rather than each separately
  // trusting a thin sample at full strength.
  const rawForm = players.map((p) => recentFormRaw(p));
  const formValuesWithData = players
    .map((p, i) => (p.recentForm.length > 0 ? rawForm[i] : null))
    .filter((v): v is number => v != null);
  const poolMeanForm = formValuesWithData.length > 0 ? average(formValuesWithData) : 0;
  const shrunkForm = players.map((p, i) => shrinkTowardPoolMean(rawForm[i], p.recentForm.length, poolMeanForm));

  // Consistency modifies form directly (not a separate weighted pillar
  // — that would mean rebalancing all 5 tuned weights again for what's
  // really a reliability adjustment on ONE of them). Kept deliberately
  // mild (0.85-1.15x) so it nudges rather than dominates: a wildly
  // inconsistent player doesn't get wiped out, a very consistent one
  // doesn't get an outsized boost either.
  const formRaw = players.map((p, i) => shrunkForm[i] * (0.85 + 0.3 * recentFormConsistency(p)));
  const venueRaw = players.map((p) => venueFitRaw(p, input));
  const h2hRaw = players.map((p) => headToHeadRaw(p, input, bowlingStrengthByTeam, battingStrengthByTeam));
  const weatherRaw = players.map((p) => weatherFitRaw(p, input));

  const formNorm = minMaxNormalize(formRaw);
  const venueNorm = minMaxNormalize(venueRaw);
  const h2hNorm = minMaxNormalize(h2hRaw);
  const weatherNorm = minMaxNormalize(weatherRaw);

  // Value is real output per credit — shrunk form (the same de-noised
  // figure the form pillar uses) divided by cost. Deliberately NOT a
  // recombination of form/venue/h2h/weather's own normalized scores:
  // that used to make value almost entirely redundant with form (a
  // player who already scored well on those four got rewarded a SECOND
  // time for the same underlying signal). Math.max floor guards the
  // division: currently safe by construction (every credit-assignment
  // path floors at 7.0), but this makes that an enforced invariant
  // rather than an assumption.
  const preValue = players.map((p, i) => shrunkForm[i] / Math.max(0.1, p.credits));
  const valueNorm = minMaxNormalize(preValue);

  return players.map((player, i) => {
    const rawComposite =
      weights.form * formNorm[i] +
      weights.venue * venueNorm[i] +
      weights.headToHead * h2hNorm[i] +
      weights.value * valueNorm[i] +
      weights.weather * weatherNorm[i];

    // Team win-rate: a mild post-hoc nudge, not a full weighted pillar
    // (deliberately kept small — this is a tie-breaker signal, not a
    // primary driver, and rebalancing all 5 tuned weights again for it
    // would be disproportionate to what it actually represents). No
    // adjustment at all if there's no accumulated data for this team yet.
    const winRate = input.teamWinRates?.[player.teamId];
    const composite = winRate != null ? rawComposite * (0.95 + 0.1 * winRate) : rawComposite;

    const breakdown: Omit<PlayerScoreBreakdown, "reason"> = {
      playerId: player.id,
      formScore: formNorm[i],
      venueScore: venueNorm[i],
      headToHeadScore: h2hNorm[i],
      valueScore: valueNorm[i],
      weatherScore: weatherNorm[i],
      composite,
    };

    return {
      ...player,
      score: { ...breakdown, reason: reasonFor(player, breakdown, findToughStyleMatchupBowlers(player, players)) },
    };
  });
}

interface RoleCounts {
  BAT: number;
  BOWL: number;
  AR: number;
  WK: number;
}

function countRoles(team: ScoredPlayer[]): RoleCounts {
  const counts: RoleCounts = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const p of team) counts[p.role]++;
  return counts;
}

function countPerTeam(team: ScoredPlayer[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of team) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
  return counts;
}

function remainingSlotsRespected(team: ScoredPlayer[], candidate: ScoredPlayer): boolean {
  const roles = countRoles(team);
  const perTeam = countPerTeam(team);
  const c = ROLE_CONSTRAINTS;

  if (team.length >= c.teamSize) return false;
  if (roles[candidate.role] + 1 > (candidate.role === "BAT" ? c.maxBatsmen : candidate.role === "BOWL" ? c.maxBowlers : candidate.role === "AR" ? c.maxAllRounders : c.maxWicketkeepers)) {
    return false;
  }
  if ((perTeam.get(candidate.teamId) ?? 0) + 1 > c.maxPerTeam) return false;
  return true;
}

function unmetMinimums(team: ScoredPlayer[]): number {
  const roles = countRoles(team);
  const c = ROLE_CONSTRAINTS;
  const slotsLeft = c.teamSize - team.length;
  const deficits = [
    Math.max(0, c.minBatsmen - roles.BAT),
    Math.max(0, c.minBowlers - roles.BOWL),
    Math.max(0, c.minAllRounders - roles.AR),
    Math.max(0, c.minWicketkeepers - roles.WK),
  ];
  const totalDeficit = deficits.reduce((a, b) => a + b, 0);
  return totalDeficit > slotsLeft ? totalDeficit - slotsLeft : 0;
}

const SWAP_REFINEMENT_MAX_ITERATIONS = 50;

/**
 * Bounded local-search refinement: for each selected player, check
 * whether swapping them for a higher-composite same-role player NOT on
 * the team (from the full pool) would still respect the credit cap and
 * per-team limit, and apply the swap if so — repeating until no
 * improving swap exists. Pass 1/2 above are greedy and can settle into
 * a locally-good-but-not-best lineup: e.g. an early pick can block a
 * later, better same-role player purely on credit-cap timing, even
 * though swapping them in afterward would still fit the budget.
 *
 * Deliberately scoped to same-role swaps only: this can never change
 * role composition (so it can't un-meet already-met minimums, and can't
 * help fix a role that had zero eligible players to begin with — see
 * meetsRoleMinimums for that separate, honest failure mode). It only
 * asks "given the roles we already picked, did we get the best
 * available player for each one?" — strictly non-decreasing on total
 * composite, capped at SWAP_REFINEMENT_MAX_ITERATIONS as a defensive
 * bound (in practice it converges in a handful of passes).
 */
function refineByLocalSwaps(team: ScoredPlayer[], pool: ScoredPlayer[], creditCap: number): ScoredPlayer[] {
  const current = [...team];
  let iterations = 0;

  while (iterations < SWAP_REFINEMENT_MAX_ITERATIONS) {
    iterations++;
    const creditsUsed = current.reduce((sum, p) => sum + p.credits, 0);
    let swapped = false;

    for (let i = 0; i < current.length; i++) {
      const incumbent = current[i];
      const perTeamWithoutIncumbent = countPerTeam(current.filter((p) => p.id !== incumbent.id));

      const better = pool
        .filter(
          (candidate) =>
            candidate.role === incumbent.role &&
            !current.some((t) => t.id === candidate.id) &&
            candidate.score.composite > incumbent.score.composite &&
            creditsUsed - incumbent.credits + candidate.credits <= creditCap &&
            (perTeamWithoutIncumbent.get(candidate.teamId) ?? 0) + 1 <= ROLE_CONSTRAINTS.maxPerTeam,
        )
        .sort((a, b) => b.score.composite - a.score.composite)[0];

      if (better) {
        current[i] = better;
        swapped = true;
        break;
      }
    }

    if (!swapped) break;
  }

  return current;
}

/**
 * Greedy-with-backtracking selection, then a bounded local-swap
 * refinement pass (see refineByLocalSwaps): repeatedly take the
 * highest-composite remaining player that keeps role minimums reachable
 * and doesn't breach the credit cap / max-per-team / role-maximum
 * constraints, then check whether any selected player can be swapped for
 * a better same-role option that still fits. Not a full knapsack solve,
 * but closes most of the realistic gap for 22-30 player pools without
 * the complexity of an exact solver.
 */
export function selectTeam(scoredPlayers: ScoredPlayer[], creditCap = ROLE_CONSTRAINTS.creditCap): ScoredPlayer[] {
  const sorted = [...scoredPlayers].sort((a, b) => b.score.composite - a.score.composite);
  const team: ScoredPlayer[] = [];
  let creditsUsed = 0;

  const tryAdd = (pool: ScoredPlayer[], requireMinimumsReachable: boolean) => {
    for (const candidate of pool) {
      if (team.some((p) => p.id === candidate.id)) continue;
      if (creditsUsed + candidate.credits > creditCap) continue;
      if (!remainingSlotsRespected(team, candidate)) continue;

      team.push(candidate);
      creditsUsed += candidate.credits;

      if (requireMinimumsReachable && unmetMinimums(team) > 0) {
        // Adding this player makes the remaining minimums unreachable
        // within the slots left — undo and keep searching.
        team.pop();
        creditsUsed -= candidate.credits;
        continue;
      }
    }
  };

  // Pass 1: fill greedily by composite score while keeping role minimums reachable.
  tryAdd(sorted, true);

  // Pass 2: if minimums are still unmet (pool too thin), relax the reachability
  // check and force-fill by role priority, cheapest-first, to hit 11 players.
  if (team.length < ROLE_CONSTRAINTS.teamSize || unmetMinimums(team) > 0) {
    const remaining = sorted.filter((p) => !team.some((t) => t.id === p.id));
    const cheapestFirst = [...remaining].sort((a, b) => a.credits - b.credits);
    tryAdd(cheapestFirst, false);
  }

  return refineByLocalSwaps(team, sorted, creditCap);
}

const MIN_RECENT_APPEARANCES = 1;

/**
 * Narrows the full squad down to players with at least one real recent
 * match appearance (from the accumulated match-log data already
 * attached to player.recentForm during squad caching) — an honest,
 * data-driven stand-in for "who's actually likely to play," since this
 * app's data source has no confirmed pre-match lineup endpoint.
 *
 * Falls back to the FULL squad — never excludes anyone — if either:
 *   (a) fewer than 11 players clear the appearance bar (recentForm data
 *       is still thin, e.g. early in the accumulator's life), or
 *   (b) the filtered pool can't satisfy minimum role requirements (e.g.
 *       enough recently-tracked players exist, but none of them happen
 *       to be a wicketkeeper) — selecting a team is impossible without
 *       the excluded players in that case, so excluding them would be
 *       actively harmful, not just imprecise.
 */
export function filterLikelyXI(players: Player[]): Player[] {
  const withRecentAppearance = players.filter((p) => p.recentForm.length >= MIN_RECENT_APPEARANCES);
  if (withRecentAppearance.length < ROLE_CONSTRAINTS.teamSize) return players;

  const countByRole = (role: Player["role"]) => withRecentAppearance.filter((p) => p.role === role).length;
  const hasEnoughOfEachRole =
    countByRole("WK") >= ROLE_CONSTRAINTS.minWicketkeepers &&
    countByRole("BAT") >= ROLE_CONSTRAINTS.minBatsmen &&
    countByRole("BOWL") >= ROLE_CONSTRAINTS.minBowlers &&
    countByRole("AR") >= ROLE_CONSTRAINTS.minAllRounders;

  return hasEnoughOfEachRole ? withRecentAppearance : players;
}

/**
 * How close a non-selected player's miss actually was, relative to the
 * weakest selected player in the same role — the actual competitive
 * cutoff for that role slot. Handles an honest edge case: selectTeam
 * isn't simple top-N-by-score (it's credit-cap and per-team-limit
 * constrained), so a non-selected player can genuinely score as well as
 * or better than a selected one in the same role and still miss out —
 * that's a budget/limit reason, not a ranking one, and gets labeled
 * accordingly rather than misleadingly implying they were "close."
 */
export function proximityNote(playerComposite: number, selectedSameRole: ScoredPlayer[]): string | null {
  if (selectedSameRole.length === 0) return null;
  const weakestSelected = Math.min(...selectedSameRole.map((p) => p.score.composite));
  const gap = weakestSelected - playerComposite;

  if (gap <= 0) {
    return "Scored as well as or better than a selected player in this role — likely missed out due to the credit cap or per-team player limit, not raw ranking";
  }
  if (gap < 0.08) return "Very close miss — just below the selected picks in this role";
  if (gap < 0.2) return "Ranked moderately behind the selected picks in this role";
  return "Ranked well behind the selected picks in this role";
}

const CAPTAIN_TIE_THRESHOLD = 0.1;

/**
 * Captain is normally just the highest composite scorer — but when
 * multiple players are close (within CAPTAIN_TIE_THRESHOLD composite
 * units), ceiling (best single recent performance) breaks the tie
 * instead of raw rank order. This matters specifically for captain
 * because their points get doubled — a genuinely higher-upside player
 * is worth preferring over a marginally-higher-average one once
 * they're already close. Vice-captain stays simple (next-best
 * composite, excluding whoever became captain) — this tie-break is
 * deliberately only applied to the single highest-leverage slot.
 */
function pickCaptainAndViceCaptain(team: ScoredPlayer[]): { captainId: string; viceCaptainId: string } {
  const ranked = [...team].sort((a, b) => b.score.composite - a.score.composite);
  if (ranked.length === 0) return { captainId: "", viceCaptainId: "" };

  const topComposite = ranked[0].score.composite;
  const contenders = ranked.filter((p) => topComposite - p.score.composite <= CAPTAIN_TIE_THRESHOLD);
  const captain = [...contenders].sort((a, b) => recentFormCeiling(b) - recentFormCeiling(a))[0] ?? ranked[0];

  const viceCaptain = ranked.find((p) => p.id !== captain.id) ?? ranked[0];
  return { captainId: captain.id, viceCaptainId: viceCaptain.id };
}

export function predictTeam(input: PredictorInput): PredictedTeamResult {
  const likelyPlayers = filterLikelyXI(input.players);
  const usedLikelyXIFilter = likelyPlayers.length !== input.players.length;

  const scored = computePlayerScores({ ...input, players: likelyPlayers });
  const team = selectTeam(scored);
  const { captainId, viceCaptainId } = pickCaptainAndViceCaptain(team);

  const selectedIds = new Set(team.map((p) => p.id));
  const scoredNotSelected = scored
    .filter((p) => !selectedIds.has(p.id))
    .sort((a, b) => b.score.composite - a.score.composite)
    .map((p) => {
      const sameRoleSelected = team.filter((t) => t.role === p.role);
      const note = proximityNote(p.score.composite, sameRoleSelected);
      return note ? { ...p, score: { ...p.score, reason: `${p.score.reason} · ${note}` } } : p;
    });

  // Players excluded by the Likely XI filter itself (zero recent
  // appearances) never went through scoring at all — without this,
  // they'd be invisible in BOTH the selected team and notSelected,
  // which defeats the point if you're specifically looking up a real
  // playing-11 player who happens to have thin accumulated data.
  const likelyIds = new Set(likelyPlayers.map((p) => p.id));
  const filteredOutPlayers: ScoredPlayer[] = usedLikelyXIFilter
    ? input.players
        .filter((p) => !likelyIds.has(p.id))
        .map((p) => ({
          ...p,
          score: {
            playerId: p.id,
            formScore: 0,
            venueScore: 0,
            headToHeadScore: 0,
            valueScore: 0,
            weatherScore: 0,
            composite: 0,
            reason: "Not enough recent match data yet to be considered — not ranked against the rest of the squad.",
          },
        }))
    : [];

  // Computed once, here, from the REAL selected team — not left for every
  // caller (API routes, tests, future UI) to re-derive independently. See
  // PredictedTeamResult.meetsRoleMinimums's doc comment for why this
  // matters: selectTeam's slot arithmetic can reach 11 players while
  // silently missing an entire role when that role's pool is too thin.
  const finalRoleCounts = countRoles(team);
  const roleShortfalls: Partial<Record<Player["role"], number>> = {};
  const shortfall = (min: number, have: number) => Math.max(0, min - have);
  if (shortfall(ROLE_CONSTRAINTS.minWicketkeepers, finalRoleCounts.WK) > 0) {
    roleShortfalls.WK = shortfall(ROLE_CONSTRAINTS.minWicketkeepers, finalRoleCounts.WK);
  }
  if (shortfall(ROLE_CONSTRAINTS.minBatsmen, finalRoleCounts.BAT) > 0) {
    roleShortfalls.BAT = shortfall(ROLE_CONSTRAINTS.minBatsmen, finalRoleCounts.BAT);
  }
  if (shortfall(ROLE_CONSTRAINTS.minBowlers, finalRoleCounts.BOWL) > 0) {
    roleShortfalls.BOWL = shortfall(ROLE_CONSTRAINTS.minBowlers, finalRoleCounts.BOWL);
  }
  if (shortfall(ROLE_CONSTRAINTS.minAllRounders, finalRoleCounts.AR) > 0) {
    roleShortfalls.AR = shortfall(ROLE_CONSTRAINTS.minAllRounders, finalRoleCounts.AR);
  }

  return {
    players: team,
    captainId,
    viceCaptainId,
    totalCredits: team.reduce((sum, p) => sum + p.credits, 0),
    totalScore: team.reduce((sum, p) => sum + p.score.composite, 0),
    usedLikelyXIFilter,
    meetsRoleMinimums: Object.keys(roleShortfalls).length === 0,
    roleShortfalls,
    notSelected: [...scoredNotSelected, ...filteredOutPlayers],
  };
}
