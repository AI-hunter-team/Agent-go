import { useEffect, useMemo } from "react";
import type { EntranceDefinition } from "../../shared/world";
import type { GameSession } from "../gameSession";
import type { GeneratedPalette } from "./generatedSurfaces";
import { createEntrancePassage } from "./generatedArchitecture";
import { disposeSurfaceGeometry } from "./surfaceGeometry";
import { Sign } from "./Sign";

function Passage({ entrance: e, overview, palette }: { entrance: EntranceDefinition; overview: boolean; palette: GeneratedPalette }) {
  const root = useMemo(() => createEntrancePassage(e,palette,overview,e.id==="A"),[e,palette,overview]);
  useEffect(() => () => disposeSurfaceGeometry(root),[root]);
  return <group name={`entry-passage-${e.id}`} position={[e.top.x,0,e.top.y]} rotation={[0,-Math.atan2(e.inward.y,e.inward.x),0]}>
    <primitive object={root} dispose={null}/>
    <Sign text={`${e.id}口 / 进站 ↓`} position={[-.2,6.45,0]} width={3} facing="west"/>
    <Sign text="B1 站厅 / 售票与安检 →" position={[8.9,3.2,0]} width={3.4} facing="west"/>
    <pointLight position={[-1,6.3,0]} intensity={35} distance={12} color="#fff0d8"/>
    <pointLight position={[6,2.4,0]} intensity={25} distance={10} color="#fff0d8"/>
  </group>;
}
export function EntrancePassages({ session, overview, palette }: { session: GameSession; overview: boolean; palette: GeneratedPalette }) {
  return <>{session.engine.world.definition.entrances?.map(e=><Passage key={e.id} entrance={e} overview={overview} palette={palette}/>)}</>;
}
