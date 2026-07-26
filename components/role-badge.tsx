import { Badge } from "@/components/ui/badge";
import type { PlayerRole } from "@/lib/cricket-api/types";

const VARIANT: Record<PlayerRole, "bat" | "bowl" | "ar" | "wk"> = {
  BAT: "bat",
  BOWL: "bowl",
  AR: "ar",
  WK: "wk",
};

export function RoleBadge({ role }: { role: PlayerRole }) {
  return <Badge variant={VARIANT[role]}>{role}</Badge>;
}
