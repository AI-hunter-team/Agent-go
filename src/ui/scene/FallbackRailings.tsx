import { useEffect, useMemo } from "react";
import { createMetroRailingAsset, makeRailingMaterials } from "../../assets/metro-railings/index";
import { batchStation, disposeBatches } from "./stationAssets";
import { stationRailingPlacements } from "./stationLayout";

/** Geometry fallback uses the same railing modules and placements as the imported scene. */
export function FallbackRailings() {
  const resources = useMemo(() => {
    const materials = makeRailingMaterials();
    const models = new Map(["metal-straight", "glass-straight", "glass-stairs"].map((id) => [id, createMetroRailingAsset(id, materials)]));
    const group = batchStation({ models, materials: new Map() }, stationRailingPlacements());
    // Prototype-only generated bends/panels are unused once their spans have been fitted.
    models.forEach((root) => disposeBatches(root));
    return { group, materials };
  }, []);
  useEffect(() => () => { disposeBatches(resources.group); Object.values(resources.materials).forEach((material) => material.dispose()); }, [resources]);
  return <primitive object={resources.group} dispose={null} />;
}
