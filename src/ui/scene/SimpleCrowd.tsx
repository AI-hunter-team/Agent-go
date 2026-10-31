import { displayFloor } from "../../sim/entranceGeometry";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import type { GameSession } from "../gameSession";
import { sampleActor } from "../presentation";
import { box, materials, sphere } from "./resources";
import { passengerAppearance } from "./passengerAppearance";

/** 用两个实例批次绘制所有普通乘客，保留人数、位置和类型颜色，省去肢体装饰。 */
export function SimpleCrowd({ session, capacity }: { session: GameSession; capacity: number }) {
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ object: new Object3D(), color: new Color(), pose: { x: 0, y: 0, z: 0, yaw: 0 } }), []);
  useFrame(() => {
    if (!bodies.current || !heads.current) return;
    const { object, color, pose } = scratch;
    let index = 0;
    for (const actor of session.presentation.current.actors.values()) {
      if(session.engine.world.definition.generatorVersion!=="legacy-v0"&&displayFloor(actor.floorId)!==displayFloor(session.engine.player.pos.floorId))continue;
      if (actor.kind === "player" || actor.kind === "guard") continue;
      if (index >= capacity) break;
      sampleActor(session.presentation, actor.id, session.alpha, pose);
      object.rotation.set(0, pose.yaw, 0);
      object.position.set(pose.x, pose.y + 0.65, pose.z);
      object.scale.set(0.38, 1.2, 0.28);
      object.updateMatrix(); bodies.current.setMatrixAt(index, object.matrix);
      color.set(passengerAppearance(actor.kind, actor.id).coat);
      bodies.current.setColorAt(index, color);
      object.position.y = pose.y + 1.5;
      object.scale.set(0.15, 0.2, 0.15);
      object.updateMatrix(); heads.current.setMatrixAt(index, object.matrix);
      index++;
    }
    bodies.current.count = heads.current.count = index;
    bodies.current.instanceMatrix.needsUpdate = heads.current.instanceMatrix.needsUpdate = true;
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
  });
  return <group dispose={null}>
    <instancedMesh key={`bodies-${capacity}`} ref={bodies} args={[box, materials.white, capacity]} frustumCulled={false} castShadow />
    <instancedMesh key={`heads-${capacity}`} ref={heads} args={[sphere, materials.white, capacity]} frustumCulled={false} castShadow />
  </group>;
}
