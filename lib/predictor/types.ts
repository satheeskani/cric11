import type { Player, PlayerRole, VenueStats } from "@/lib/cricket-api/types";
import type { WeatherForecast } from "@/lib/weather/types";

export interface PredictorWeights {
  form: number;
  venue: number;
  headToHead: number;
  value: number;
  weather: number;
}

export const DEFAULT_WEIGHTS: PredictorWeights = {
  form: 0.35,
  venue: 0.2,
  headToHead: 0.15,
  value: 0.15,
  weather: 0.15,
};

export interface PlayerScoreBreakdown {
  playerId: string;
  formScore: number;
  venueScore: number;
  headToHeadScore: number;
  valueScore: number;
  weatherScore: number;
  composite: number;
  reason: string;
}

export interface ScoredPlayer extends Player {
  score: PlayerScoreBreakdown;
}

export interface PredictedTeamResult {
  players: ScoredPlayer[];
  captainId: string;
  viceCaptainId: string;
  totalCredits: number;
  totalScore: number;
  /**
   * True when the selection pool was narrowed to players with at least
   * one real recent match appearance (see filterLikelyXI in
   * scoreTeam.ts) — the honest data-driven substitute for a confirmed
   * pre-match lineup, since this app's data source doesn't expose one.
   * False means either the full squad was used because too few players
   * cleared the appearance bar yet, or recentForm data is still thin.
   */
  usedLikelyXIFilter: boolean;
  /**
   * True only when the selected 11 actually satisfies every role minimum
   * (WK/BAT/BOWL/AR) — computed here, once, from the real selected team,
   * rather than left for every caller to re-derive independently. Exists
   * because selectTeam's slot-arithmetic can still reach 11 players while
   * silently missing an entire role if the pool is too thin in that role
   * (e.g. every wicketkeeper got marked out) — a real, known edge case,
   * not hypothetical. False means the team below is NOT format-valid;
   * check roleShortfalls for which role(s) fell short and by how much.
   */
  meetsRoleMinimums: boolean;
  /** Which roles fell short of their minimum, and by how many players —
   * empty when meetsRoleMinimums is true. */
  roleShortfalls: Partial<Record<PlayerRole, number>>;
  /**
   * Every scored player who was considered but NOT selected into the
   * final 11, sorted by composite score (closest misses first). Each
   * one carries the same real reasoning text the selected 11 get — so
   * if a player you're wondering about (e.g. someone in the real
   * announced lineup, or a name you saw hyped by selection-percentage
   * on another platform) isn't in the Suggested XI, you can see exactly
   * why the algorithm ranked them lower, in its own words, rather than
   * just trusting external hype blind.
   */
  notSelected: ScoredPlayer[];
}

export interface HeadToHeadHint {
  playerId: string;
  fantasyPointsAvg: number;
}

export interface VenueHint {
  playerId: string;
  average: number;
  strikeRate: number;
}

export interface PredictorInput {
  players: Player[];
  venue: VenueStats | null;
  headToHeadHints?: HeadToHeadHint[];
  venueHints?: VenueHint[];
  weights?: Partial<PredictorWeights>;
  weather?: WeatherForecast | null;
  /**
   * Real recent win rate (0-1) per teamId, from accumulated match
   * results (see lib/db/team-match-logs.ts) — fetched by the caller,
   * not looked up inside the scorer, keeping computePlayerScores a pure
   * function over already-fetched data. A team with no accumulated
   * decisive (W/L) results simply won't have an entry here, and gets no
   * adjustment — honest neutral, not a fabricated 50/50.
   */
  teamWinRates?: Record<string, number>;
}

/**
 * Bounds tightened from the original generic-platform maximums (which
 * technically allowed up to 6 bowlers and only 3 batters) to reflect how
 * a knowledgeable human actually builds a team: batting depth as a
 * baseline requirement, bowler-stacking treated as high-risk rather than
 * a valid shape just because the numbers marginally favored it that
 * match. Without this, small situational nudges (weather, venue) could
 * tip a cluster of similarly-scored bowlers just ahead of batters and
 * the optimizer would legally build an 11 that's 6 bowlers deep and only
 * 3 batters — a shape no real player would pick, since bowlers are
 * higher-variance (wicket-or-nothing) while batters offer steadier
 * floor value.
 */
export const ROLE_CONSTRAINTS = {
  minWicketkeepers: 1,
  maxWicketkeepers: 2,
  minBatsmen: 4,
  maxBatsmen: 6,
  minBowlers: 3,
  maxBowlers: 4,
  minAllRounders: 1,
  maxAllRounders: 4,
  teamSize: 11,
  creditCap: 100,
  maxPerTeam: 10,
};
