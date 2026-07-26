"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Disclaimer } from "@/components/disclaimer";
import { useTrackRecord } from "@/hooks/use-cricket-data";

export default function TrackRecordPage() {
  const { data, isLoading, isError } = useTrackRecord();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header>
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          &larr; Back to predictor
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Track record</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every finalized match below compares our data-informed suggested XI to the average of 100 randomly
          drawn, rule-valid XIs from the same player pool — using each match&apos;s actual results, entered
          manually after the match. This is the honest way to show whether the method adds value; it is not a
          promise of future results.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Matches tracked</p>
            <p className="text-2xl font-semibold">{data?.summary.totalFinalized ?? "–"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Beat random XI</p>
            <p className="text-2xl font-semibold">
              {data?.summary.beatRandomRate != null ? `${Math.round(data.summary.beatRandomRate * 100)}%` : "–"}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Average edge vs. random (fantasy points)</p>
            <p className="text-2xl font-semibold">
              {data?.summary.averageEdge != null ? data.summary.averageEdge.toFixed(1) : "–"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Match-by-match</CardTitle>
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
                    <TableCell className="font-medium">{r.matchId}</TableCell>
                    <TableCell>{new Date(r.finalizedAt).toLocaleDateString()}</TableCell>
                    <TableCell>{r.predictedXIScore.toFixed(1)}</TableCell>
                    <TableCell>{r.randomXIAvgScore.toFixed(1)}</TableCell>
                    <TableCell className={r.edge >= 0 ? "text-accent" : "text-destructive"}>
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
