"use client";

import { useState } from "react";
import { RoleBadge } from "@/components/role-badge";
import type { ScoredPlayer } from "@/lib/predictor/types";

export function NotSelectedPanel({
  notSelected,
  teamName,
}: {
  notSelected: ScoredPlayer[];
  teamName: (teamId: string) => string;
}) {
  const [query, setQuery] = useState("");
  if (notSelected.length === 0) return null;

  const filtered = notSelected.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer list-none p-4 text-sm font-medium">
        Why wasn&rsquo;t a player picked? ({notSelected.length} considered, not selected)
      </summary>
      <div className="border-t border-border p-4">
        <input
          type="text"
          placeholder="Search a player name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <ul className="grid max-h-96 gap-2 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-2">
                <RoleBadge role={p.role} />
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{teamName(p.teamId)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.score.reason}</p>
            </li>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground">No matching player.</p>}
        </ul>
      </div>
    </details>
  );
}
