import { getDb, isMongoConfigured } from "@/lib/db/mongodb";
import { selectTeam } from "@/lib/predictor/scoreTeam";
import { DEFAULT_WEIGHTS } from "@/lib/predictor/types";
import type { Player } from "@/lib/cricket-api/types";
import type { PredictedTeamResult, PredictorWeights } from "@/lib/predictor/types";
import type { PredictionDocument } from "./types";

const COLLECTION = "predictions";
const RANDOM_XI_TRIALS = 100;

/**
 * Called every time /api/predict generates a team. Upserts a single
 * snapshot per match (rather than appending unbounded history) so the
 * track record always reflects the most recent prediction made before
 * that match's result is recorded — a manual `finalizeMatch` call locks
 * it in permanently via the `finalized` flag.
 */
export async function logPrediction(
  matchId: string,
  result: PredictedTeamResult,
  weights: Partial<PredictorWeights> | undefined,
): Promise<void> {
  if (!isMongoConfigured()) return;

  const db = await getDb();
  const existing = await db.collection<PredictionDocument>(COLLECTION).findOne({ _id: matchId });
  if (existing?.finalized) return; // don't overwrite a locked-in result

  const doc: PredictionDocument = {
    _id: matchId,
    matchId,
    generatedAt: new Date(),
    weights: { ...DEFAULT_WEIGHTS, ...weights },
    players: result.players.map((p) => ({ id: p.id, name: p.name, role: p.role, teamId: p.teamId, credits: p.credits })),
    captainId: result.captainId,
    viceCaptainId: result.viceCaptainId,
    totalCredits: result.totalCredits,
    finalized: false,
  };

  await db.collection<PredictionDocument>(COLLECTION).replaceOne({ _id: matchId }, doc, { upsert: true });
}

function scoreXI(playerIds: string[], actualPoints: Record<string, number>, captainId?: string, viceCaptainId?: string): number {
  return playerIds.reduce((sum, id) => {
    const points = actualPoints[id] ?? 0;
    const multiplier = id === captainId ? 2 : id === viceCaptainId ? 1.5 : 1;
    return sum + points * multiplier;
  }, 0);
}

/**
 * Draws RANDOM_XI_TRIALS constraint-valid (credit cap, role minimums,
 * max-per-team) but otherwise random XIs from the full player pool, and
 * averages their actual score. This is the baseline the predicted XI is
 * measured against — "did the algorithm beat picking randomly?" is a much
 * more honest credibility signal than an unqualified accuracy claim.
 */
function averageRandomXIScore(pool: Player[], actualPoints: Record<string, number>): number {
  let total = 0;
  for (let i = 0; i < RANDOM_XI_TRIALS; i++) {
    const shuffled = pool.map((p) => ({
      ...p,
      score: { playerId: p.id, formScore: 0, venueScore: 0, headToHeadScore: 0, valueScore: 0, weatherScore: 0, composite: Math.random(), reason: "" },
    }));
    const randomTeam = selectTeam(shuffled);
    const captainId = randomTeam[Math.floor(Math.random() * randomTeam.length)]?.id;
    total += scoreXI(
      randomTeam.map((p) => p.id),
      actualPoints,
      captainId,
    );
  }
  return total / RANDOM_XI_TRIALS;
}

export async function finalizeMatch(
  matchId: string,
  actualPoints: Record<string, number>,
  fullPlayerPool: Player[],
): Promise<PredictionDocument | null> {
  if (!isMongoConfigured()) {
    throw new Error("MongoDB is not configured — accuracy tracking requires MONGODB_URI.");
  }

  const db = await getDb();
  const doc = await db.collection<PredictionDocument>(COLLECTION).findOne({ _id: matchId });
  if (!doc) return null;

  const predictedXIScore = scoreXI(
    doc.players.map((p) => p.id),
    actualPoints,
    doc.captainId,
    doc.viceCaptainId,
  );
  const randomXIAvgScore = averageRandomXIScore(fullPlayerPool, actualPoints);

  const update: Partial<PredictionDocument> = {
    finalized: true,
    finalizedAt: new Date(),
    actualPoints,
    predictedXIScore,
    randomXIAvgScore,
    edge: predictedXIScore - randomXIAvgScore,
  };

  await db.collection<PredictionDocument>(COLLECTION).updateOne({ _id: matchId }, { $set: update });
  return { ...doc, ...update };
}

export async function getTrackRecord(): Promise<PredictionDocument[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  return db
    .collection<PredictionDocument>(COLLECTION)
    .find({ finalized: true })
    .sort({ finalizedAt: -1 })
    .toArray();
}
