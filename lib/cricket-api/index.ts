import type { CricketApiProvider } from "./types";
import { MockCricketApiProvider } from "./mock-provider";

let provider: CricketApiProvider | null = null;

/**
 * Provider is chosen by CRICKET_API_PROVIDER ("mock" | "cricketdata" |
 * "cricbuzz"). Defaults to mock so UI development never blocks on API keys.
 * Each real provider is required lazily so a missing API key only throws
 * when that provider is actually selected.
 *
 * This provider is only ever consumed by the Vercel Cron refresh job — see
 * app/api/cron/refresh-cricket-data/route.ts — never by user-facing
 * routes, which read exclusively from the Mongo cache (lib/db/api-cache.ts).
 */
export function getCricketApiProvider(): CricketApiProvider {
  if (provider) return provider;

  const kind = process.env.CRICKET_API_PROVIDER ?? "mock";
  let created: CricketApiProvider;
  if (kind === "cricketdata") {
    const { CricketDataProvider } = require("./cricketdata-provider");
    created = new CricketDataProvider();
  } else if (kind === "cricbuzz") {
    const { CricbuzzProvider } = require("./cricbuzz-provider");
    created = new CricbuzzProvider();
  } else {
    created = new MockCricketApiProvider();
  }
  provider = created;
  return created;
}

export * from "./types";
