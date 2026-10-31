import { useEffect, useMemo } from "react";
import type { MeshStandardMaterial } from "three";
import { createStationStairs, disposeStationStairs } from "./staircase";

export function StationStairs({ material }: { material: MeshStandardMaterial }) {
  const stairs = useMemo(() => createStationStairs(material), [material]);
  useEffect(() => () => disposeStationStairs(stairs), [stairs]);
  return <primitive object={stairs} dispose={null} />;
}
