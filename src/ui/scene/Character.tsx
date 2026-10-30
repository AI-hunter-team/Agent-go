import { Component, Suspense, memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { useAnimations } from "@react-three/drei/core/useAnimations";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Box3, Vector3, type Group } from "three";
import type { GameSession } from "../gameSession";
import { sampleActor, type ActorFrame, type Motion } from "../presentation";
import { box, coat, cylinder, materials, sphere } from "./resources";

const CLIPS: Record<Motion, string> = { idle: "Idle", walk: "Walk", interact: "Interact", jump: "Jump" };
export class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(`模型加载失败，已使用几何角色：${error.message}`); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ImportedModel({ url, session, actorId, reducedMotion }: { url: string; session: GameSession; actorId: string; reducedMotion: boolean }) {
  // Local uncompressed GLB/glTF needs no external Draco or font CDN.
  const { scene, animations } = useGLTF(url, false, false);
  const model = useMemo(() => {
    const result = clone(scene);
    result.traverse((object) => { if ("isMesh" in object) { object.castShadow = true; object.receiveShadow = true; } });
    return result;
  }, [scene]);
  const fitting = useMemo(() => {
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 1.7 / Math.max(0.01, size.y);
    return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number] };
  }, [model]);
  const { actions, mixer } = useAnimations(animations, model);
  const last = useRef("");
  const root = useRef<Group>(null);
  useFrame(() => {
    mixer.timeScale = session.frozen || reducedMotion ? 0 : session.speed;
    const motion = session.presentation.current.actors.get(actorId)?.motion ?? "idle";
    const name = actions[CLIPS[motion]] ? CLIPS[motion] : actions.Idle ? "Idle" : "";
    if (name !== last.current) {
      if (last.current) actions[last.current]?.fadeOut(0.15);
      if (name) actions[name]?.reset().fadeIn(0.15).play();
      last.current = name;
    }
    if (root.current) root.current.position.y = !actions[CLIPS[motion]] && motion === "walk" && !reducedMotion ? Math.abs(Math.sin(session.visualTime * 8)) * 0.035 : 0;
  }, -1);
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); }, [mixer, model]);
  return <group ref={root}><group position={fitting.position} scale={fitting.scale}><primitive object={model} dispose={null} /></group></group>;
}

function GeometricPerson({ kind, session, actorId, reducedMotion }: { kind: ActorFrame["kind"]; session: GameSession; actorId: string; reducedMotion: boolean }) {
  const legs = [useRef<Group>(null), useRef<Group>(null)];
  const arms = [useRef<Group>(null), useRef<Group>(null)];
  const torso = useRef<Group>(null);
  const color = kind === "player" ? materials.blue : kind === "guard" ? materials.ink : kind === "elderly" ? materials.ochre : kind === "luggage" ? materials.sage : kind === "hurried" ? materials.brick : materials.grey;
  useFrame(() => {
    const actor = session.presentation.current.actors.get(actorId);
    const t = session.visualTime;
    const walk = !reducedMotion && actor?.motion === "walk" ? Math.sin(t * (kind === "hurried" ? 12 : 9)) * 0.42 : 0;
    for (let i = 0; i < 2; i++) {
      if (legs[i].current) legs[i].current!.rotation.x = walk * (i ? -1 : 1);
      if (arms[i].current) arms[i].current!.rotation.x = actor?.motion === "interact" ? -0.65 : -walk * (i ? -1 : 1) * 0.7;
    }
    if (torso.current) torso.current.rotation.x = kind === "elderly" ? 0.12 : actor?.motion === "jump" ? -0.25 : 0;
  });
  return <group scale={0.88}>
    {[0, 1].map((i) => <group ref={legs[i]} key={`leg${i}`} position={[i ? 0.115 : -0.115, 0.64, 0]}>
      <mesh geometry={box} material={materials.ink} position={[0, -0.27, 0]} scale={[0.09, 0.54, 0.1]} castShadow />
      <mesh geometry={box} material={materials.ink} position={[0, -0.59, 0.065]} scale={[0.14, 0.1, 0.26]} castShadow />
    </group>)}
    <group ref={torso} position={[0, 0.67, 0]}>
      <mesh geometry={coat} material={color} position={[0, 0.36, 0]} castShadow />
      <mesh geometry={cylinder} material={materials.chalk} position={[0, 0.84, 0]} scale={[0.055, 0.16, 0.055]} castShadow />
      <mesh geometry={sphere} material={materials.white} position={[0, 1.04, 0]} scale={[0.17, 0.23, 0.16]} castShadow />
      <mesh geometry={sphere} material={color} position={[0, 1.19, -0.015]} scale={[0.19, 0.085, 0.18]} castShadow />
      {[0, 1].map((i) => <group ref={arms[i]} key={`arm${i}`} position={[i ? 0.23 : -0.23, 0.64, 0]}>
        <mesh geometry={box} material={color} position={[0, -0.24, 0]} scale={[0.09, 0.48, 0.11]} castShadow />
        <mesh geometry={sphere} material={materials.white} position={[0, -0.49, 0]} scale={0.065} castShadow />
      </group>)}
      {kind === "guard" && <mesh geometry={box} material={materials.ochre} position={[0.09, 0.53, 0.17]} scale={[0.08, 0.09, 0.02]} />}
      {kind === "luggage" && <mesh geometry={box} material={materials.ochre} position={[0.4, -0.26, -0.15]} scale={[0.28, 0.48, 0.22]} castShadow />}
      {kind === "elderly" && <mesh geometry={box} material={materials.ink} position={[0.34, -0.12, 0.19]} scale={[0.035, 1.05, 0.035]} castShadow />}
    </group>
  </group>;
}

export const Character = memo(function Character({ id, kind, session, assetUrl, onAssetError, reducedMotion }: { id: string; kind: ActorFrame["kind"]; session: GameSession; assetUrl: string; onAssetError: (message: string) => void; reducedMotion: boolean }) {
  const root = useRef<Group>(null);
  const pose = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  useFrame(() => {
    if (!root.current) return;
    const actor = sampleActor(session.presentation, id, session.alpha, pose.current);
    root.current.visible = !!actor;
    if (!actor) return;
    root.current.position.set(pose.current.x, pose.current.y, pose.current.z);
    root.current.rotation.y = pose.current.yaw;
  });
  const placeholder = <GeometricPerson kind={kind} session={session} actorId={id} reducedMotion={reducedMotion} />;
  return <group ref={root}>
    {kind === "player" && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
      <ringGeometry args={[0.34, 0.39, 32]} /><meshBasicMaterial color="#315c65" transparent opacity={0.65} depthWrite={false} />
    </mesh>}
    {kind === "player" && assetUrl ? <ModelBoundary key={assetUrl} fallback={placeholder} onError={onAssetError}>
      <Suspense fallback={placeholder}><ImportedModel url={assetUrl} session={session} actorId={id} reducedMotion={reducedMotion} /></Suspense>
    </ModelBoundary> : placeholder}
  </group>;
});
