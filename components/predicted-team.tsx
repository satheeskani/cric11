"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Player, PlayerRole } from "@/lib/cricket-api/types";
import type { PredictedTeamResult } from "@/lib/predictor/types";
import { UserX } from "lucide-react";

const ROLE_AVATAR_CLASS: Record<PlayerRole, string> = {
  BAT: "bg-role-bat/15 text-role-bat",
  BOWL: "bg-role-bowl/15 text-role-bowl",
  AR: "bg-role-ar/15 text-role-ar",
  WK: "bg-role-wk/15 text-role-wk",
};

const ROLE_SECTION_ORDER: PlayerRole[] = ["WK", "BAT", "AR", "BOWL"];
const ROLE_SECTION_LABEL: Record<PlayerRole, string> = {
  WK: "Wicketkeepers",
  BAT: "Batters",
  AR: "All-rounders",
  BOWL: "Bowlers",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggested XI</CardTitle>
        {result && (
          <p className="mt-1 text-xs text-muted-foreground">
            Data-informed suggestion, ranked by fit for this match
          </p>
        )}
      </CardHeader>
      <CardContent>
        {excludedPlayers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
            <span className="text-xs text-muted-foreground">Marked out:</span>
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
            <div className="flex flex-col gap-4">
              {ROLE_SECTION_ORDER.map((role) => {
                const players = result.players
                  .filter((p) => p.role === role)
                  .sort((a, b) => b.score.composite - a.score.composite);
                if (players.length === 0) return null;

                return (
                  <div key={role}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_SECTION_LABEL[role]} ({players.length})
                    </h3>
                    <ol className="flex flex-col">
                      {players.map((p) => {
                        runningIndex += 1;
                        return (
                          <li
                            key={p.id}
                            className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                          >
                            <span className="w-5 shrink-0 text-sm text-muted-foreground">{runningIndex}</span>
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${ROLE_AVATAR_CLASS[p.role]}`}
                            >
                              {initials(p.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-medium leading-tight">
                                {p.name}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {teamName(p.teamId)}
                                </span>
                                {p.id === result.captainId && (
                                  <Badge variant="accent" className="ml-1.5 align-middle">
                                    C
                                  </Badge>
                                )}
                                {p.id === result.viceCaptainId && (
                                  <Badge variant="accent" className="ml-1.5 align-middle">
                                    VC
                                  </Badge>
                                )}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.score.reason}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onMarkOut(p.id)}
                              title="Mark as out (not playing) and re-pick"
                              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
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
