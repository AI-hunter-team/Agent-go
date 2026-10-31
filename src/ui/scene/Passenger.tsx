import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { GameSession } from "../gameSession";
import { createPassengerModel, posePassenger } from "./passengerModel";
import type { CrowdKind } from "./passengerAppearance";

/** 普通乘客独立展示；世界位置、朝向及主角/保安资产仍由 Character 管理。 */
export function Passenger({ kind, session, actorId, reducedMotion }: { kind: CrowdKind; session: GameSession; actorId: string; reducedMotion: boolean }) {
  const model = useMemo(() => createPassengerModel(kind, actorId), [kind, actorId]);
  useFrame(() => {
    const actor = session.presentation.current.actors.get(actorId);
    posePassenger(model, kind, actor?.motion ?? "idle", session.visualTime, reducedMotion);
  });
  return <primitive object={model.root} dispose={null} />;
}
