"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useUpcomingMatches } from "@/hooks/use-cricket-data";
import { cn, formatMatchTime } from "@/lib/utils";
import type { UpcomingMatch } from "@/lib/cricket-api/types";

interface MatchSelectorProps {
  selectedMatchId: string | null;
  onSelect: (matchId: string) => void;
}

function groupBySeries(matches: UpcomingMatch[]): Map<string, UpcomingMatch[]> {
  const groups = new Map<string, UpcomingMatch[]>();
  for (const match of matches) {
    const key = match.seriesName ?? "Matches";
    const group = groups.get(key);
    if (group) group.push(match);
    else groups.set(key, [match]);
  }
  return groups;
}

export function MatchSelector({ selectedMatchId, onSelect }: MatchSelectorProps) {
  const { data: matches, isLoading, isError } = useUpcomingMatches();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError) return <p className="text-sm text-destructive">Could not load matches.</p>;
  if (!matches || matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No upcoming matches in followed tournaments right now.</p>;
  }

  const groups = groupBySeries(matches);

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([seriesName, seriesMatches]) => (
        <div key={seriesName} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">{seriesName}</h3>
          <div className="flex flex-col gap-2" role="listbox" aria-label={seriesName}>
            {seriesMatches.map((match) => {
              const selected = match.id === selectedMatchId;
              return (
                <button
                  key={match.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(match.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[4px] border border-l-4 px-3.5 py-2.5 text-left transition-colors",
                    selected
                      ? "border-border border-l-accent bg-accent/10"
                      : "border-border border-l-border bg-card hover:border-l-accent/50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold leading-tight">
                      {match.teamA.shortName} <span className="text-accent">v</span> {match.teamB.shortName}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{match.venueName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-primary">{formatMatchTime(match.startTime)}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {match.format}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
