"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MatchSelector } from "@/components/match-selector";
import { MatchOverview } from "@/components/match-overview";
import { PredictedTeam } from "@/components/predicted-team";
import { NotSelectedPanel } from "@/components/not-selected-panel";
import { Disclaimer } from "@/components/disclaimer";
import { useSquad, useUpcomingMatches, usePredictedTeam } from "@/hooks/use-cricket-data";
import { DEFAULT_WEIGHTS, type PredictorWeights } from "@/lib/predictor/types";
import { Info } from "lucide-react";

export default function HomePage() {
  const { data: matches } = useUpcomingMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [weights] = useState<PredictorWeights>(DEFAULT_WEIGHTS);
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<string[]>([]);
  const [vanishedMatchNotice, setVanishedMatchNotice] = useState(false);

  const selectedMatch = useMemo(() => matches?.find((m) => m.id === selectedMatchId) ?? null, [matches, selectedMatchId]);

  // If the selected match drops out of the upcoming list — almost
  // always because it started and the server-side filter excludes it —
  // the old behavior silently blanked the whole prediction UI with zero
  // explanation. Now it's surfaced as a clear, dismissible notice.
  useEffect(() => {
    if (selectedMatchId && matches && !matches.some((m) => m.id === selectedMatchId)) {
      setVanishedMatchNotice(true);
      setSelectedMatchId(null);
    }
  }, [matches, selectedMatchId]);

  function handleSelectMatch(id: string) {
    setVanishedMatchNotice(false);
    setSelectedMatchId(id);
  }

  // Exclusions are per-match, not global — clear them whenever the
  // selected match changes so a player marked out for one game doesn't
  // silently stay excluded when you switch to a different match.
  useEffect(() => {
    setExcludedPlayerIds([]);
  }, [selectedMatchId]);

  const { data: squad } = useSquad(selectedMatchId);
  const {
    data: predicted,
    isLoading: predictLoading,
    isError: predictError,
    error: predictErrorObj,
  } = usePredictedTeam(selectedMatchId, weights, 0, excludedPlayerIds);

  function teamName(teamId: string): string {
    if (!selectedMatch) return teamId;
    if (teamId === selectedMatch.teamA.id) return selectedMatch.teamA.shortName;
    if (teamId === selectedMatch.teamB.id) return selectedMatch.teamB.shortName;
    return teamId;
  }

  const excludedPlayers = useMemo(() => {
    if (!squad) return [];
    const allPlayers = [...squad.teamA, ...squad.teamB];
    return excludedPlayerIds
      .map((id) => allPlayers.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [squad, excludedPlayerIds]);

  function handleMarkOut(playerId: string) {
    setExcludedPlayerIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
  }

  function handleRestore(playerId: string) {
    setExcludedPlayerIds((prev) => prev.filter((id) => id !== playerId));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fantasy Cricket Analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a match for a data-informed suggested XI. Statistical analysis, not a prediction guarantee.
          </p>
        </div>
        <Link href="/track-record" className="shrink-0 text-xs text-muted-foreground hover:underline">
          Track record &rarr;
        </Link>
      </header>

      {vanishedMatchNotice && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Your selected match has started (or is no longer upcoming) and dropped off the list. Pick another
            match below.
          </p>
        </div>
      )}

      <MatchSelector selectedMatchId={selectedMatchId} onSelect={handleSelectMatch} />

      {selectedMatch && (
        <>
          <MatchOverview match={selectedMatch} />

          <PredictedTeam
            result={predicted}
            isLoading={predictLoading}
            isError={predictError}
            errorMessage={predictErrorObj instanceof Error ? predictErrorObj.message : undefined}
            teamName={teamName}
            excludedPlayers={excludedPlayers}
            onMarkOut={handleMarkOut}
            onRestore={handleRestore}
          />

          {predicted && <NotSelectedPanel notSelected={predicted.notSelected} teamName={teamName} />}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
