"use client";

import { useQuery } from "@tanstack/react-query";
import type { Player, UpcomingMatch } from "@/lib/cricket-api/types";
import type { PredictedTeamResult, PredictorWeights } from "@/lib/predictor/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed with ${res.status}`);
  }
  return res.json();
}

export function useUpcomingMatches() {
  return useQuery({
    queryKey: ["matches"],
    queryFn: () => fetchJson<{ matches: UpcomingMatch[] }>("/api/matches"),
    select: (data) => data.matches,
  });
}

export function useSquad(matchId: string | null) {
  return useQuery({
    queryKey: ["squad", matchId],
    queryFn: () => fetchJson<{ teamA: Player[]; teamB: Player[] }>(`/api/squad/${matchId}`),
    enabled: !!matchId,
  });
}

export function useTrackRecord() {
  return useQuery({
    queryKey: ["track-record"],
    queryFn: () =>
      fetchJson<{
        records: Array<{
          matchId: string;
          finalizedAt: string;
          predictedXIScore: number;
          randomXIAvgScore: number;
          edge: number;
          captainId: string;
          viceCaptainId: string;
        }>;
        summary: {
          totalFinalized: number;
          beatRandomCount: number;
          beatRandomRate: number | null;
          averageEdge: number | null;
        };
      }>("/api/track-record"),
  });
}

export function usePredictedTeam(
  matchId: string | null,
  weights: Partial<PredictorWeights>,
  regenerateKey: number,
  excludedPlayerIds: string[] = [],
) {
  return useQuery({
    queryKey: ["predict", matchId, weights, regenerateKey, excludedPlayerIds],
    queryFn: () =>
      fetchJson<PredictedTeamResult>("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, weights, excludedPlayerIds }),
      }),
    enabled: !!matchId,
  });
}
