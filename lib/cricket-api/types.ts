export type MatchFormat = "T20" | "ODI" | "Test";

export type PlayerRole = "BAT" | "BOWL" | "AR" | "WK";

export interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
}

export interface UpcomingMatch {
  id: string;
  format: MatchFormat;
  startTime: string; // ISO timestamp
  status: "upcoming" | "live" | "completed";
  teamA: TeamInfo;
  teamB: TeamInfo;
  venueId: string;
  venueName: string;
  seriesName?: string;
  /** Optional — only populated by providers whose raw response includes
   * coordinates (Cricbuzz does). Used to fetch weather for the match;
   * providers that omit this simply mean weather gets skipped for that
   * match's prediction, not an error. */
  venueLat?: number;
  venueLon?: number;
}

export interface RecentFormEntry {
  date: string; // ISO date
  opponent: string;
  result: "W" | "L" | "NR";
  runsScored?: number;
  wicketsTaken?: number;
  fantasyPoints: number;
}

export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  teamId: string;
  photoUrl: string;
  battingStyle?: string;
  bowlingStyle?: string;
  credits: number;
  recentForm: RecentFormEntry[];
}

export interface HeadToHeadRecord {
  teamAId: string;
  teamBId: string;
  lastMeetings: Array<{
    date: string;
    winnerTeamId: string;
    venue: string;
  }>;
}

export interface TeamFormEntry {
  date: string;
  opponent: string;
  result: "W" | "L" | "NR";
}

export interface VenueStats {
  id: string;
  name: string;
  avgFirstInningsScore: number;
  avgSecondInningsScore: number;
  pitchType: "batting" | "bowling" | "balanced" | "spin-friendly" | "pace-friendly";
  avgBoundaryCount: number;
  tossWinBattingBias: number; // 0-1, probability toss winner chooses to bat
  lat: number;
  lon: number;
}

export interface PlayerStats {
  playerId: string;
  venuePerformance?: {
    venueId: string;
    matches: number;
    average: number;
    strikeRate: number;
  };
  headToHeadPerformance?: {
    opponentTeamId: string;
    matches: number;
    average: number;
    fantasyPointsAvg: number;
  };
}

/**
 * Provider-agnostic interface. Implementations: mock provider (default,
 * no API key needed) and CricAPI provider. Swap via CRICKET_API_PROVIDER env var.
 */
export interface CricketApiProvider {
  getUpcomingMatches(): Promise<UpcomingMatch[]>;
  getSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] }>;
  getPlayerStats(playerId: string): Promise<PlayerStats>;
  getVenueStats(venueId: string): Promise<VenueStats | null>;
  getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHeadRecord>;
  getTeamRecentForm(teamId: string): Promise<TeamFormEntry[]>;
}
