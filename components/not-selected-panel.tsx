"use client";

import { useState } from "react";
import { RoleBadge } from "@/components/role-badge";
import { PlayerFormLog } from "@/components/player-form-log";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoredPlayer } from "@/lib/predictor/types";

export function NotSelectedPanel({
  notSelected,
  teamName,
}: {
  notSelected: ScoredPlayer[];
  teamName: (teamId: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  if (notSelected.length === 0) return null;

  const filtered = notSelected.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  function toggleExpanded(playerId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  return (
    <details className="rounded-[6px] border border-dashed border-border bg-card">
      <summary className="cursor-pointer list-none p-4 text-sm font-bold uppercase tracking-wide">
        Why wasn&rsquo;t a player picked?{" "}
        <span className="font-normal normal-case text-muted-foreground">
          ({notSelected.length} considered, not selected)
        </span>
      </summary>
      <div className="border-t border-border p-4">
        <input
          type="text"
          placeholder="Search a player name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3 w-full rounded-[4px] border border-border bg-background px-3 py-1.5 text-sm"
        />
        <ul className="grid max-h-96 gap-2 overflow-y-auto">
          {filtered.map((p) => {
            const expanded = expandedIds.has(p.id);
            return (
              <li key={p.id} className="rounded-[4px] border border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => toggleExpanded(p.id)}
                  aria-expanded={expanded}
                  title="Show real match-by-match log"
                  className="flex w-full items-start gap-2 p-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={p.role} />
                      <span className="text-sm font-bold">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{teamName(p.teamId)}</span>
                    </div>
                    <p className="mt-1 text-xs italic text-muted-foreground">{p.score.reason}</p>
                  </div>
                  <ChevronDown
                    className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                {expanded && (
                  <div className="border-t border-border px-2.5 py-2">
                    <PlayerFormLog entries={p.recentForm} />
                  </div>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground">No matching player.</p>}
        </ul>
      </div>
    </details>
  );
}
