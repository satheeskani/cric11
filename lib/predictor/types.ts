import type { Player, VenueStats } from "@/lib/cricket-api/types";
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

export const ROLE_CONSTRAINTS = {
  minWicketkeepers: 1,
  maxWicketkeepers: 4,
  minBatsmen: 3,
  maxBatsmen: 6,
  minBowlers: 3,
  maxBowlers: 6,
  minAllRounders: 1,
  maxAllRounders: 4,
  teamSize: 11,
  creditCap: 100,
  maxPerTeam: 10,
};
