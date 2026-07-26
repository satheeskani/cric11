import type { PlayerRole } from "@/lib/cricket-api/types";
import type { PredictorWeights } from "@/lib/predictor/types";

export interface PredictionPlayerSnapshot {
  id: string;
  name: string;
  role: PlayerRole;
  teamId: string;
  credits: number;
}

export interface PredictionDocument {
  _id: string; // matchId
  matchId: string;
  generatedAt: Date;
  weights: PredictorWeights;
  players: PredictionPlayerSnapshot[];
  captainId: string;
  viceCaptainId: string;
  totalCredits: number;
  finalized: boolean;
  finalizedAt?: Date;
  actualPoints?: Record<string, number>;
  predictedXIScore?: number;
  randomXIAvgScore?: number;
  edge?: number;
}
