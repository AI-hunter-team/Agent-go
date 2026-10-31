import type { MeshStandardMaterial } from "three";
import { ESCALATOR_BOTTOM, ESCALATOR_TOP, STAIRS_TOP } from "../../sim/layout";
import type { GameSession } from "../gameSession";
import { Descent } from "./Descent";
import { Sign } from "./Sign";
import { StationStairs } from "./StationStairs";

/** Both station renderers retain the detailed stone stairs and the separate south escalator. */
export function StationDescents({ material, session, reducedMotion }: { material: MeshStandardMaterial; session: GameSession; reducedMotion: boolean }) {
  return <group name="station-descents">
    <StationStairs material={material} />
    <Descent top={ESCALATOR_TOP} bottom={ESCALATOR_BOTTOM} escalator session={session} reducedMotion={reducedMotion} />
    {[{ top: STAIRS_TOP, label: "04A  北楼梯 / STAIRS  ↓", hint: "下楼 6 秒 · 直达站台" }, { top: ESCALATOR_TOP, label: "04B  南扶梯 / ESCALATOR  ↓", hint: "乘坐 4 秒 · 候梯可改道" }].map(({ top, label, hint }) => <group key={label}>
      <Sign text={label} position={[top.x - .5, 2.8, top.y]} width={5.8} />
      <Sign text={hint} position={[top.x - .4, 2.15, top.y]} width={4.4} dark={false} />
    </group>)}
  </group>;
}
