"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Disclaimer } from "@/components/disclaimer";
import { useTrackRecord } from "@/hooks/use-cricket-data";
import { cn } from "@/lib/utils";

export default function TrackRecordPage() {
  const { data, isLoading, isError } = useTrackRecord();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header>
        <Link href="/" className="text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-accent">
          &larr; Back to predictor
        </Link>
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Season stats</p>
        <h1 className="text-3xl font-black italic uppercase leading-none tracking-tight">Track record</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every finalized match below compares our data-informed suggested XI to the average of 100 randomly
          drawn, rule-valid XIs from the same player pool — using each match&apos;s actual results, entered
          manually after the match. This is the honest way to show whether the method adds value; it is not a
          promise of future results.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-role-wk">
          <CardContent className="p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Matches tracked</p>
            <p className="text-3xl font-black italic tabular-nums">{data?.summary.totalFinalized ?? "–"}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-role-bat">
          <CardContent className="p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Beat random XI</p>
            <p className="text-3xl font-black italic tabular-nums">
              {data?.summary.beatRandomRate != null ? `${Math.round(data.summary.beatRandomRate * 100)}%` : "–"}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 border-l-4 border-l-primary sm:col-span-2">
          <CardContent className="p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Average edge vs. random (fantasy points)
            </p>
            <p className="text-3xl font-black italic tabular-nums">
              {data?.summary.averageEdge != null ? data.summary.averageEdge.toFixed(1) : "–"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            Match-by-match
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-40 w-full" />}
          {isError && <p className="text-sm text-destructive">Could not load track record.</p>}
          {data && data.records.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No matches finalized yet. Check back after upcoming matches conclude.
            </p>
          )}
          {data && data.records.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Finalized</TableHead>
                  <TableHead>Suggested XI score</TableHead>
                  <TableHead>Random XI avg</TableHead>
                  <TableHead>Edge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.records.map((r) => (
                  <TableRow key={r.matchId}>
                    <TableCell className="font-bold">{r.matchId}</TableCell>
                    <TableCell>{new Date(r.finalizedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="tabular-nums">{r.predictedXIScore.toFixed(1)}</TableCell>
                    <TableCell className="tabular-nums">{r.randomXIAvgScore.toFixed(1)}</TableCell>
                    <TableCell className={cn("tabular-nums font-bold", r.edge >= 0 ? "text-role-bat" : "text-destructive")}>
                      {r.edge >= 0 ? "+" : ""}
                      {r.edge.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Disclaimer />
    </main>
  );
}
