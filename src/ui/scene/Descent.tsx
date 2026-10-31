import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Vec } from "../../shared/types";
import type { GameSession } from "../gameSession";
import { box, materials } from "./resources";
import { Sign } from "./Sign";

export function Descent({ top, bottom, escalator, session, reducedMotion }: {
  top: Vec; bottom: Vec; escalator?: boolean; session: GameSession; reducedMotion: boolean;
}) {
  const treads = useRef<(Mesh | null)[]>([]);
  const count = 16;
  const length = bottom.x - top.x;
  const width = escalator ? 3 : 4;
  const angle = Math.atan2(-2, length);
  useFrame(() => {
    if (!escalator || reducedMotion) return;
    const offset = (session.visualTime * .5) % 1;
    for (let i = 0; i < count; i++) {
      const p = ((i + offset) % count) / count;
      treads.current[i]?.position.set(top.x + (p + .5 / count) * length, -2 * p - .1, top.y);
    }
  });
  return <group>
    {Array.from({ length: count }, (_, i) => <mesh key={i} ref={mesh => { treads.current[i] = mesh; }} geometry={box}
      material={escalator ? materials.grey : i % 2 ? materials.chalk : materials.ochre}
      position={[top.x + length * (i + .5) / count, -2 * i / count - .1, top.y]} scale={[length / count, .2, width]} receiveShadow />)}
    {[-1, 1].map(side => <group key={side}>
      <mesh geometry={box} material={materials.ink} position={[(top.x + bottom.x) / 2, -.15, top.y + side * (width / 2 + .12)]}
        scale={[Math.hypot(length, 2), escalator ? .23 : .09, .12]} rotation={[0, 0, angle]} />
      {escalator && <mesh geometry={box} material={materials.sage} position={[(top.x + bottom.x) / 2, -.65, top.y + side * (width / 2 + .12)]}
        scale={[Math.hypot(length, 2), .9, .12]} rotation={[0, 0, angle]} />}
    </group>)}
    <Sign text={escalator ? "04B  扶梯 / ESCALATOR  ↓" : "04A  楼梯 / STAIRS  ↓"} position={[top.x - .5, 2.8, top.y]} width={5.8} />
    <Sign text={escalator ? "乘坐 4 秒 · 候梯可改道" : "下楼 6 秒 · 直达站台"} position={[top.x - .4, 2.15, top.y]} width={4.4} dark={false} />
  </group>;
}
