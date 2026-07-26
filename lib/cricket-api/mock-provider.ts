import venues from "@/data/venues.json";
import { MOCK_HEAD_TO_HEAD, MOCK_PLAYERS, MOCK_TEAM_FORM, getMockMatches } from "./mock-data";
import type {
  CricketApiProvider,
  HeadToHeadRecord,
  Player,
  PlayerStats,
  TeamFormEntry,
  UpcomingMatch,
  VenueStats,
} from "./types";

const venueById = new Map<string, VenueStats>(
  (venues as VenueStats[]).map((v) => [v.id, v]),
);

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h * 1103515245 + 12345) | 0;
    return ((h >>> 0) % 1000) / 1000;
  };
}

export class MockCricketApiProvider implements CricketApiProvider {
  async getUpcomingMatches(): Promise<UpcomingMatch[]> {
    return getMockMatches();
  }

  async getSquad(matchId: string): Promise<{ teamA: Player[]; teamB: Player[] }> {
    const match = getMockMatches().find((m) => m.id === matchId);
    if (!match) throw new Error(`Unknown matchId: ${matchId}`);
    return {
      teamA: MOCK_PLAYERS[match.teamA.id] ?? [],
      teamB: MOCK_PLAYERS[match.teamB.id] ?? [],
    };
  }

  async getPlayerStats(playerId: string): Promise<PlayerStats> {
    const rand = seededRandom(playerId);
    const venueIds = Object.keys(venueById);
    const venueId = venueIds[Math.floor(rand() * venueIds.length)];
    return {
      playerId,
      venuePerformance: {
        venueId,
        matches: Math.floor(rand() * 8) + 1,
        average: Math.round((rand() * 30 + 20) * 10) / 10,
        strikeRate: Math.round((rand() * 60 + 110) * 10) / 10,
      },
      headToHeadPerformance: {
        opponentTeamId: "N/A",
        matches: Math.floor(rand() * 10) + 1,
        average: Math.round((rand() * 25 + 20) * 10) / 10,
        fantasyPointsAvg: Math.round(rand() * 30 + 25),
      },
    };
  }

  async getVenueStats(venueId: string): Promise<VenueStats | null> {
    return venueById.get(venueId) ?? null;
  }

  async getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHeadRecord> {
    const record = MOCK_HEAD_TO_HEAD.find(
      (h) =>
        (h.teamAId === teamAId && h.teamBId === teamBId) ||
        (h.teamAId === teamBId && h.teamBId === teamAId),
    );
    return record ?? { teamAId, teamBId, lastMeetings: [] };
  }

  async getTeamRecentForm(teamId: string): Promise<TeamFormEntry[]> {
    return MOCK_TEAM_FORM[teamId] ?? [];
  }
}
