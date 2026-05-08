import { Badge } from "@/components/ui/badge";
import { statusLabels, statusTone } from "@/lib/constants";
import type { GiveawayStatus } from "@/types/giveaway";

export function StatusBadge({ status }: { status: string }) {
  const typedStatus = status as GiveawayStatus;
  const label = statusLabels[typedStatus] ?? status;
  const tone = statusTone[typedStatus] ?? "outline";

  return <Badge variant={tone}>{label}</Badge>;
}
