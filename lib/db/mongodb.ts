import dns from "node:dns";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? "cric11";

/**
 * `mongodb+srv://` connection strings require Node to issue a raw SRV/TXT
 * DNS query itself (separate code path from the OS resolver that fetch()
 * uses). On some Windows setups Node's resolver fails to read the real
 * system nameservers and silently falls back to 127.0.0.1, which nothing
 * listens on — every SRV lookup then fails with ECONNREFUSED even though
 * the network is otherwise fine. Only kicks in when that broken fallback
 * is detected, so a correctly configured resolver is left untouched.
 */
function ensureWorkingDnsResolver(): void {
  if (dns.getServers().every((s) => s === "127.0.0.1" || s === "::1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
}

/**
 * Standard serverless-safe connection cache: Vercel functions can be
 * reused between invocations (warm starts), but each module reload
 * (cold start, HMR in dev) would otherwise open a fresh connection and
 * exhaust MongoDB Atlas's free-tier connection limit. Stashing the
 * connection promise on `global` survives HMR reloads in dev and warm
 * lambda reuse in production; only a true cold start creates a new one.
 */
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local or use mock-only mode.");
  }
  ensureWorkingDnsResolver();
  const client = new MongoClient(uri);
  return client.connect();
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "production") {
    // Fresh promise per cold start is fine in production — Vercel reuses
    // the module scope (and thus this promise) across warm invocations.
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createClientPromise();
    }
    return global._mongoClientPromise;
  }

  // In dev, also cache on `global` specifically so Next.js's module HMR
  // doesn't spawn a new client on every file save.
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise();
  }
  return global._mongoClientPromise;
}

export function isMongoConfigured(): boolean {
  return !!uri;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}
