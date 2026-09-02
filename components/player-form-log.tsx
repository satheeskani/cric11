import { cn } from "@/lib/utils";
import type { RecentFormEntry } from "@/lib/cricket-api/types";

const RESULT_CLASS: Record<RecentFormEntry["result"], string> = {
  W: "text-role-bat",
  L: "text-destructive",
  NR: "text-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Real match-by-match log behind a player's one-line reasoning summary
 * — the evidence, not just the verdict. Renders whichever real figures
 * exist per entry (batting, bowling, or both for an all-rounder who did
 * both in the same match); never fabricates a stat that isn't there.
 */
export function PlayerFormLog({ entries }: { entries: RecentFormEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-1 py-2 text-xs italic text-muted-foreground">No tracked matches yet for this player.</p>;
  }

  return (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 text-left font-bold">Date</th>
            <th className="py-1.5 pr-2 text-left font-bold">Opponent</th>
            <th className="py-1.5 pr-2 text-left font-bold">Result</th>
            <th className="py-1.5 pr-2 text-right font-bold">Batting</th>
            <th className="py-1.5 pr-2 text-right font-bold">Bowling</th>
            <th className="py-1.5 text-right font-bold">Fantasy pts</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(e.date)}</td>
              <td className="py-1.5 pr-2 truncate">{e.opponent}</td>
              <td className={cn("py-1.5 pr-2 font-bold", RESULT_CLASS[e.result])}>{e.result}</td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                {e.runsScored != null
                  ? `${e.runsScored}${e.ballsFaced != null ? ` (${e.ballsFaced}b)` : ""}${
                      e.strikeRate != null ? ` · SR ${e.strikeRate}` : ""
                    }`
                  : "—"}
              </td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                {e.wicketsTaken != null
                  ? `${e.wicketsTaken}w${e.oversBowled != null ? ` (${e.oversBowled}ov)` : ""}${
                      e.economy != null ? ` · Econ ${e.economy}` : ""
                    }`
                  : "—"}
              </td>
              <td className="py-1.5 text-right font-bold">{e.fantasyPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
