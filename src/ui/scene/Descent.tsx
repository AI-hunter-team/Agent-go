import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Vec } from "../../shared/types";
import type { GameSession } from "../gameSession";
import { box, materials } from "./resources";
import { ESCALATOR_WIDTH } from "./stationLayout";
import { STAIR_DETAILS } from "./staircase";

export function Descent({ top, bottom, escalator, session, reducedMotion }: {
  top: Vec; bottom: Vec; escalator?: boolean; session: GameSession; reducedMotion: boolean;
}) {
  const treads = useRef<(Mesh | null)[]>([]);
  const count = 16;
  const length = bottom.x - top.x;
  const width = escalator ? ESCALATOR_WIDTH : STAIR_DETAILS.width;
  const angle = Math.atan2(-2, length);
  useFrame(() => {
    if (!escalator || reducedMotion || session.frozen) return;
    const offset = session.visualTime * count / 4;
    for (let i = 0; i < count; i++) {
      const p = ((i + offset) % count) / count;
      treads.current[i]?.position.set(top.x + (p + .5 / count) * length, -2 * p - .1, top.y);
    }
  });
  return <group name="station-escalator" userData={{ upper: [top.x, 0, top.y], lower: [bottom.x, -2, bottom.y], width }}>
    {Array.from({ length: count }, (_, i) => <mesh key={i} ref={mesh => { treads.current[i] = mesh; }} geometry={box}
      material={escalator ? materials.grey : i % 2 ? materials.chalk : materials.ochre}
      position={[top.x + length * (i + .5) / count, -2 * i / count - .1, top.y]} scale={[length / count, .2, width]} receiveShadow />)}
    {[-1, 1].map(side => <group key={side}>
      <mesh geometry={box} material={materials.ink} position={[(top.x + bottom.x) / 2, -.82, top.y + side * (width / 2 - .12)]}
        scale={[Math.hypot(length, 2), .18, .12]} rotation={[0, 0, angle]} />
      {escalator && <mesh geometry={box} material={materials.sage} position={[(top.x + bottom.x) / 2, -1.05, top.y + side * (width / 2 - .12)]}
        scale={[Math.hypot(length, 2), .4, .12]} rotation={[0, 0, angle]} />}
    </group>)}

  </group>;
}
