"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerFormLog } from "@/components/player-form-log";
import { cn } from "@/lib/utils";
import type { Player, PlayerRole } from "@/lib/cricket-api/types";
import type { PredictedTeamResult } from "@/lib/predictor/types";
import { ChevronDown, UserX } from "lucide-react";

const ROLE_BORDER_CLASS: Record<PlayerRole, string> = {
  BAT: "border-l-role-bat",
  BOWL: "border-l-role-bowl",
  AR: "border-l-role-ar",
  WK: "border-l-role-wk",
};

const ROLE_SECTION_ORDER: PlayerRole[] = ["WK", "BAT", "AR", "BOWL"];
const ROLE_SECTION_LABEL: Record<PlayerRole, string> = {
  WK: "Wicketkeepers",
  BAT: "Batters",
  AR: "All-rounders",
  BOWL: "Bowlers",
};

export function PredictedTeam({
  result,
  isLoading,
  isError,
  errorMessage,
  teamName,
  excludedPlayers,
  onMarkOut,
  onRestore,
}: {
  result: PredictedTeamResult | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  teamName: (teamId: string) => string;
  excludedPlayers: Player[];
  onMarkOut: (playerId: string) => void;
  onRestore: (playerId: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(playerId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1 shrink-0 skew-x-[-20deg] bg-accent" aria-hidden="true" />
          <CardTitle className="text-base font-black italic uppercase tracking-tight">Suggested XI</CardTitle>
        </div>
        {result && (
          <p className="mt-1 text-xs text-muted-foreground">
            Data-informed suggestion, ranked by fit for this match &middot; tap a player for their real match log
          </p>
        )}
      </CardHeader>
      <CardContent>
        {excludedPlayers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[3px] border border-border bg-muted/40 p-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marked out:</span>
            {excludedPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onRestore(p.id)}
                className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:border-foreground/20"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="grid gap-2">
            {Array.from({ length: 11 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            {errorMessage ?? "Could not generate a predicted team for this match."}
          </p>
        )}
        {result && (() => {
          let runningIndex = 0;
          return (
            <div className="flex flex-col gap-5">
              {ROLE_SECTION_ORDER.map((role) => {
                const players = result.players
                  .filter((p) => p.role === role)
                  .sort((a, b) => b.score.composite - a.score.composite);
                if (players.length === 0) return null;

                return (
                  <div key={role}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                        {ROLE_SECTION_LABEL[role]} &middot; {players.length}
                      </h3>
                      <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-2">
                      {players.map((p) => {
                        runningIndex += 1;
                        const expanded = expandedIds.has(p.id);
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "rounded-[4px] border border-border border-l-4 bg-card",
                              ROLE_BORDER_CLASS[p.role],
                            )}
                          >
                            <div className="flex items-center gap-3 px-3.5 py-2.5">
                              <span
                                className="w-8 shrink-0 text-center text-xl font-black italic leading-none text-muted-foreground/50"
                                aria-hidden="true"
                              >
                                {String(runningIndex).padStart(2, "0")}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(p.id)}
                                aria-expanded={expanded}
                                title="Show real match-by-match log"
                                className="min-w-0 flex-1 text-left"
                              >
                                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 truncate text-[15px] font-bold leading-tight">
                                  {p.name}
                                  <span className="text-xs font-medium text-muted-foreground">{teamName(p.teamId)}</span>
                                  {p.id === result.captainId && <Badge variant="captain">Captain</Badge>}
                                  {p.id === result.viceCaptainId && <Badge variant="vice">Vice-capt</Badge>}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.score.reason}</p>
                              </button>
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                  expanded && "rotate-180",
                                )}
                                aria-hidden="true"
                              />
                              <button
                                type="button"
                                onClick={() => onMarkOut(p.id)}
                                title="Mark as out (not playing) and re-pick"
                                className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {expanded && (
                              <div className="border-t border-border px-3.5 py-2">
                                <PlayerFormLog entries={p.recentForm} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
