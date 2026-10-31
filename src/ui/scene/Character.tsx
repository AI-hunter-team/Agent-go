import { Component, Suspense, memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei/core/Gltf";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Box3, Vector3, type Group, type MeshBasicMaterial, type Object3D, type SkinnedMesh } from "three";
import type { GameSession } from "../gameSession";
import { sampleActor, type ActorFrame, type Motion } from "../presentation";
import { box, coat, cylinder, materials, sphere } from "./resources";
import { disposeAvatar, findAvatarClip } from "../avatarModel";
import { createAvatarRootMotionGuard } from "./avatarRootMotion";
import { createProceduralLocomotion } from "./proceduralLocomotion";
import { AvatarAnimator } from "./avatarAnimator";
import { getScenePerformance } from "./scenePerformance";
import { CharacterClick, type CaptureTarget } from "./characterClick";

const blobModels = new Map<string, { users: number; scene: Object3D }>();
export class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  /** 加载失败时只让主角回退为几何角色。 */
  static getDerivedStateFromError() { return { failed: true }; }
  /** 将错误反馈给显示设置，便于重新导入或恢复默认。 */
  componentDidCatch(error: Error) { this.props.onError(`模型加载失败，已使用几何角色：${error.message}`); }
  /** 渲染正常模型或回退角色。 */
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** 加载并适配带骨骼的角色，将游戏动作映射为模型动画。 */
function ImportedModel({ url, session, actorId, reducedMotion }: { url: string; session: GameSession; actorId: string; reducedMotion: boolean }) {
  // Local uncompressed GLB/glTF needs no external Draco or font CDN.
  const { scene, animations } = useGLTF(url, false, false);
  const model = useMemo(() => {
    const result = clone(scene);
    result.traverse((object) => { if ("isMesh" in object) { object.castShadow = true; object.receiveShadow = true; } });
    // 克隆后先更新整棵骨架，再求包围盒；否则部分导出资产会尺寸错误并偏离脚下位置。
    result.updateMatrixWorld(true);
    return result;
  }, [scene]);
  const fitting = useMemo(() => {
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 1.7 / Math.max(0.01, size.y);
    return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number] };
  }, [model]);
  const generated = useMemo(() => !findAvatarClip(animations, "walk") ? createProceduralLocomotion(model).filter((clip) => !findAvatarClip(animations, clip.name.toLowerCase() as Motion)) : [], [animations, model]);
  const availableAnimations = useMemo(() => [...animations, ...generated], [animations, generated]);
  const animator = useMemo(() => new AvatarAnimator(model, availableAnimations), [model, availableAnimations]);
  const performance = getScenePerformance(session);
  const constrainRootMotion = useMemo(() => createAvatarRootMotionGuard(model), [model]);
  const root = useRef<Group>(null);
  // 仅主角登记舞蹈和问候；保安的普通播放仍服从世界冻结。
  useEffect(() => {
    if (actorId !== "player") return;
    performance.setClips(animator.performances.danceClips, animator.performances.greeting?.duration ?? 0, url);
  }, [actorId, animator, performance, url]);
  useFrame(() => {
    const motion = session.presentation.current.actors.get(actorId)?.motion ?? "idle";
    const player = actorId === "player";
    animator.update({ motion, delta: performance.delta, speed: session.speed, frozen: session.frozen,
      reducedMotion, dance: player ? performance.dance : "", victoryTime: performance.victoryTime,
      danceTime: performance.danceTime, previousDance: player ? performance.previousDance : "", previousDanceTime: performance.previousDanceTime,
      greetingTime: player ? performance.greetingTime : null });
    // 模型 Y 才是竖直方向；骨架父节点可旋转，不能直接冻结骨骼局部 X/Z。
    constrainRootMotion();
    if (root.current) root.current.position.y = generated.length > 0 && motion === "walk" && !reducedMotion && !(player && performance.dance) ? Math.abs(Math.sin(session.visualTime * Math.PI * 2)) * 0.025 : 0;
  });
  useEffect(() => {
    const cached = blobModels.get(url) ?? { users: 0, scene };
    if (url.startsWith("blob:")) { cached.users++; blobModels.set(url, cached); }
    return () => {
      animator.dispose();
      model.traverse((object) => { if ("isSkinnedMesh" in object) (object as SkinnedMesh).skeleton.dispose(); });
      if (!url.startsWith("blob:")) return;
      cached.users--;
      // 新局会重挂载同一主角，等待挂载完成再释放已无人使用的模型。
      queueMicrotask(() => {
        if (cached.users === 0 && blobModels.get(url) === cached) {
          disposeAvatar(cached.scene); useGLTF.clear(url); blobModels.delete(url);
        }
      });
    };
  }, [animator, model, scene, url]);
  return <group ref={root}><group position={fitting.position} scale={fitting.scale}><primitive object={model} dispose={null} /></group></group>;
}

/** 绘制 NPC 及模型暂不可用时的程序角色。 */
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

/** 插值角色位置与方向，为主角和保安应用各自的模型及额外朝向。 */
export const Character = memo(function Character({ id, kind, session, assetUrl, assetRotation, onAssetError, reducedMotion }: { id: string; kind: ActorFrame["kind"]; session: GameSession; assetUrl: string; assetRotation: number; onAssetError: (message: string) => void; reducedMotion: boolean }) {
  const root = useRef<Group>(null);
  const pose = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  const ring = useRef<MeshBasicMaterial>(null);
  const pointer = useRef(new CharacterClick());
  const performance = getScenePerformance(session);
  const canvas = useThree((state) => state.gl.domElement);
  // R3F 会在原生 pointercancel 时清理悬停，不转发该事件给组；在画布上释放手势。
  useEffect(() => {
    if (kind !== "player") return;
    const cancel = (event: PointerEvent) => pointer.current.cancel(event);
    canvas.addEventListener("pointercancel", cancel);
    return () => { canvas.removeEventListener("pointercancel", cancel); pointer.current.reset(); };
  }, [canvas, kind]);
  // 更换主角资源时立即撤销旧动作能力，加载失败的模型不会保留旧舞蹈状态。
  useEffect(() => { if (kind === "player") performance.setAsset(assetUrl); }, [kind, performance, assetUrl]);
  /** 记录命中主角的按下位置，保持原有相机拖动传播。 */
  function down(event: ThreeEvent<PointerEvent>) {
    if (kind !== "player") return;
    pointer.current.down({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button, target: event.target as unknown as CaptureTarget });
  }
  /** 拖动超过六像素即取消本次点选，回到起点也不会误触。 */
  function move(event: ThreeEvent<PointerEvent>) {
    pointer.current.move(event);
  }
  /** 只在短距离点击结束时问候；胜利和重复点击由展示状态统一拒绝。 */
  function up(event: ThreeEvent<PointerEvent>) {
    if (pointer.current.up(event)) performance.greet(reducedMotion);
  }
  useFrame(() => {
    if (!root.current) return;
    const actor = sampleActor(session.presentation, id, session.alpha, pose.current);
    root.current.visible = !!actor;
    if (!actor) return;
    root.current.position.set(pose.current.x, pose.current.y, pose.current.z);
    root.current.rotation.y = pose.current.yaw;
    if (ring.current) { ring.current.opacity = performance.time < performance.selectedUntil ? 1 : 0.65; ring.current.color.set(performance.time < performance.selectedUntil ? "#c69a44" : "#315c65"); }
  });
  const placeholder = <GeometricPerson kind={kind} session={session} actorId={id} reducedMotion={reducedMotion} />;
  return <group ref={root} name={`actor-${id}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
    {kind === "player" && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
      <ringGeometry args={[0.34, 0.39, 32]} /><meshBasicMaterial ref={ring} color="#315c65" transparent opacity={0.65} depthWrite={false} />
    </mesh>}
    {(kind === "player" || kind === "guard") && assetUrl ? <ModelBoundary key={assetUrl} fallback={placeholder} onError={onAssetError}>
      <Suspense fallback={placeholder}><group rotation={[0, assetRotation * Math.PI / 180, 0]}><ImportedModel url={assetUrl} session={session} actorId={id} reducedMotion={reducedMotion} /></group></Suspense>
    </ModelBoundary> : placeholder}
  </group>;
});
