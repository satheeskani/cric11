"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlarmClock } from "lucide-react";
import type { UpcomingMatch } from "@/lib/cricket-api/types";

const LINEUP_NUDGE_WINDOW_MINUTES = 45;

function timeUntil(startTime: string): string {
  const diffMs = new Date(startTime).getTime() - Date.now();
  if (diffMs <= 0) return "In progress or completed";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `Starts in ${days}d ${hours % 24}h`;
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  return `Starts in ${hours}h ${minutes}m`;
}

function minutesUntil(startTime: string): number {
  return (new Date(startTime).getTime() - Date.now()) / (1000 * 60);
}

/**
 * Deliberately minimal: no confirmation-stage tracker (Cricbuzz doesn't
 * expose toss time or lineup-confirmed timestamps, so a fake "squad ->
 * toss -> lineup" progress bar would be showing certainty about data we
 * don't actually have — see conversation history). Venue/weather/form
 * context now lives in the scorer's per-player reasoning text instead of
 * separate stat cards here.
 *
 * The lineup-check nudge below is a pure timing reminder, not a data
 * signal — this app has no way to detect a real lineup announcement, so
 * instead it prompts you to go check manually (and use the "mark as
 * out" feature on the Suggested XI) around when lineups are typically
 * announced in practice, roughly 15-30 minutes before a match.
 */
export function MatchOverview({ match }: { match: UpcomingMatch }) {
  const [countdown, setCountdown] = useState(() => timeUntil(match.startTime));
  const [minsLeft, setMinsLeft] = useState(() => minutesUntil(match.startTime));

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(timeUntil(match.startTime));
      setMinsLeft(minutesUntil(match.startTime));
    }, 60_000);
    return () => clearInterval(id);
  }, [match.startTime]);

  const showLineupNudge = minsLeft > 0 && minsLeft <= LINEUP_NUDGE_WINDOW_MINUTES;

  return (
    <div className="flex flex-col gap-2">
      <Card className="relative overflow-hidden border-t-2 border-t-accent">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent opacity-[0.08]"
          aria-hidden="true"
        />
        <CardContent className="relative flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xl font-black italic uppercase leading-none tracking-tight">
              {match.teamA.shortName} <span className="not-italic text-accent">v</span> {match.teamB.shortName}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">{match.venueName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{match.format}</Badge>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[13px] font-semibold text-foreground">
              <AlarmClock className="h-3.5 w-3.5 text-accent" />
              {countdown}
            </span>
          </div>
        </CardContent>
      </Card>

      {showLineupNudge && (
        <div className="flex items-start gap-2.5 rounded-[4px] border-l-4 border-l-primary bg-primary/10 p-3">
          <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            Lineups are typically announced around now. Check the real lineup and use{" "}
            <span className="font-bold">&ldquo;mark as out&rdquo;</span> below on anyone not actually playing,
            then regenerate.
          </p>
        </div>
      )}
    </div>
  );
}
