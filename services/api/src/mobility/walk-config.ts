export const SIRA_WALK = {
  maxTotalDistanceM: 5000,
  maxAccessOrEgressDistanceM: 2500,
  normalTransferDistanceM: 400,
  maxTransferDistanceM: 1000,
  speedsKmh: { normal: 4.5, slow: 3.2, fast: 5.1 },
  allowStraightLineFallback: false,
} as const;

export type WalkConnectorKind = "access" | "transfer" | "egress";

export const classifyTransferDistance = (distanceM: number) => {
  if (distanceM <= 150) return "FACILE";
  if (distanceM <= SIRA_WALK.normalTransferDistanceM) return "NORMALE";
  if (distanceM <= SIRA_WALK.maxTransferDistanceM) return "DIFFICILE";
  return "IMPOSSIBLE";
};
