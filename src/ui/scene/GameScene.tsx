import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Object3D, OrthographicCamera, PerspectiveCamera, PMREMGenerator, Vector3, type Mesh } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { WIDTH, HEIGHT } from "../../sim/layout";
import { platformElevation } from "../presentation";
import { RULES } from "../../sim/scenario";
import type { GameSession } from "../gameSession";
import type { FrameMetrics } from "../frameMetrics";
import { sampleActor } from "../presentation";
import { Station } from "./Station";
import { Character } from "./Character";
import { SimpleCrowd } from "./SimpleCrowd";
import { cameraFraction } from "./cameraCollision";
import { STATION_CEILING } from "../../assets/station-kit/dimensions";

export interface CameraSettings { mode: "follow" | "overview"; reset: number; }
export interface SceneProps {
  session: GameSession;
  camera: CameraSettings;
  quality: "standard" | "low";
  targetFps: 60 | 30 | 15;
  simpleCrowd: boolean;
  reducedMotion: boolean;
  assetUrl: string;
  assetRotation: number;
  guardAssetUrl: string;
  guardAssetRotation: number;
  onAssetError: (message: string) => void;
  onGuardAssetError: (message: string) => void;
  onStationAssetError: (message: string) => void;
  onFailure: (message: string) => void;
  metrics: FrameMetrics;
  showVision: boolean;
  showTrail: boolean;
}

/** 按目标频率唤醒按需渲染；空闲或隐藏时休眠，阶段与采样变化可立即唤醒。 */
function RenderSchedule({ session, targetFps, metrics }: Pick<SceneProps, "session" | "targetFps" | "metrics">) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const interval = 1000 / targetFps;
    /** 只为运行或主动采样续订帧，累计余量避免高刷屏下的限帧漂移。 */
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || (session.frozen && !metrics.active)) return;
      if (now - last >= interval) {
        const elapsed = now - last;
        last = now - Math.max(0, elapsed % interval);
        invalidate();
      }
      raf = requestAnimationFrame(frame);
    };
    /** 状态改变或标签页重新可见时补绘一次，静止场景也能响应设置和镜头。 */
    const wake = () => {
      cancelAnimationFrame(raf); raf = 0;
      if (document.hidden) return;
      invalidate(); last = performance.now();
      if (!session.frozen || metrics.active) raf = requestAnimationFrame(frame);
    };
    const unsubscribe = session.subscribe(wake);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", wake); cancelAnimationFrame(raf); };
  }, [session, targetFps, metrics, invalidate]);
  return null;
}

/** 更新跟随/总览相机，仅在镜头尚未停稳时继续补绘静止场景。 */
function CameraRig({ session, settings, reducedMotion }: { session: GameSession; settings: CameraSettings; reducedMotion: boolean }) {
  const { gl, size, set, invalidate } = useThree();
  const cameras = useMemo(() => ({ follow: new PerspectiveCamera(58, 1, 0.08, 160), overview: new OrthographicCamera(-35, 35, 20, -20, 0.1, 180) }), []);
  const orbit = useRef({ yaw: 0, pitch: 0.16, distance: 4.2 });
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const pose = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  const vectors = useMemo(() => ({ target: new Vector3(), desired: new Vector3(), eye: new Vector3() }), []);
  const initial = useRef(true);
  useEffect(() => {
    const active = cameras[settings.mode];
    if (active instanceof PerspectiveCamera) active.aspect = size.width / Math.max(1, size.height);
    else {
      const aspect = size.width / Math.max(1, size.height);
      const halfHeight = Math.max(26, (WIDTH / 2 + 9) / aspect); const halfWidth = halfHeight * aspect;
      active.left = -halfWidth; active.right = halfWidth; active.top = halfHeight; active.bottom = -halfHeight;
    }
    active.updateProjectionMatrix(); set({ camera: active }); initial.current = true;
  }, [cameras, set, settings.mode, size.width, size.height]);
  useEffect(() => { orbit.current = { yaw: 0, pitch: 0.16, distance: 4.2 }; initial.current = true; }, [settings.reset, session.generation]);
  useEffect(() => {
    const canvas = gl.domElement;
    /** 记录跟随相机的拖动起点。 */
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || settings.mode !== "follow") return;
      drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    };
    /** 拖动调整环绕角度，并唤醒静止画面。 */
    const move = (event: PointerEvent) => {
      if (!drag.current || drag.current.pointer !== event.pointerId) return;
      orbit.current.yaw -= (event.clientX - drag.current.x) * 0.006;
      orbit.current.pitch = Math.max(-0.04, Math.min(0.65, orbit.current.pitch + (event.clientY - drag.current.y) * 0.004));
      drag.current.x = event.clientX; drag.current.y = event.clientY;
      invalidate();
    };
    /** 结束相机拖动。 */
    const up = () => { drag.current = null; };
    /** 缩放跟随镜头，并唤醒静止画面。 */
    const wheel = (event: WheelEvent) => {
      if (settings.mode !== "follow") return;
      event.preventDefault(); orbit.current.distance = Math.max(2.2, Math.min(9, orbit.current.distance + event.deltaY * 0.006));
      invalidate();
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel); drag.current = null; };
  }, [gl, settings.mode, invalidate]);
  useFrame((state, delta) => {
    const { target, desired, eye } = vectors;
    if (settings.mode === "overview") {
      state.camera.position.set(WIDTH / 2 - 23, 50, HEIGHT + 23); state.camera.lookAt(WIDTH / 2, -0.5, HEIGHT / 2); return;
    }
    sampleActor(session.presentation, "player", session.alpha, pose.current);
    target.set(pose.current.x, 1.25 + pose.current.y, pose.current.z);
    const yaw = pose.current.yaw + orbit.current.yaw;
    const distance = orbit.current.distance;
    desired.set(target.x - Math.sin(yaw) * distance, target.y + 0.65 + Math.sin(orbit.current.pitch) * distance, target.z - Math.cos(yaw) * distance);
    const fraction = cameraFraction(target, desired);
    eye.copy(target).lerp(desired, fraction);
    if (initial.current || reducedMotion || fraction < 0.99) { state.camera.position.copy(eye); initial.current = false; }
    else state.camera.position.lerp(eye, 1 - Math.exp(-delta * 12));
    const safeFraction = cameraFraction(target, state.camera.position);
    if (safeFraction < 1) state.camera.position.lerpVectors(target, state.camera.position, safeFraction);
    state.camera.lookAt(target);
    if (session.frozen && state.camera.position.distanceToSquared(eye) > 0.00001) invalidate();
  });
  return null;
}

/** 绘制开发用保安视距示意，不参与实际发现判定。 */
function GuardVision({ id, session }: { id: string; session: GameSession }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const actor = session.presentation.current.actors.get(id);
    if (mesh.current && actor) { mesh.current.position.set(actor.x, 0.018, actor.z); mesh.current.rotation.set(-Math.PI / 2, 0, actor.yaw - Math.PI / 2); }
  });
  const half = RULES.guardFovDeg * Math.PI / 360;
  return <mesh ref={mesh}><circleGeometry args={[RULES.guardRange, 40, -half, half * 2]} /><meshBasicMaterial color="#7f9485" transparent opacity={0.18} depthWrite={false} /></mesh>;
}

/** 绘制可选的视距、历史轨迹和当前路径。 */
function DebugGround({ session, vision, trail }: { session: GameSession; vision: boolean; trail: boolean }) {
  const player = session.presentation.current.actors.get("player");
  const points = session.engine.trail;
  const linePoints = useMemo(() => new Float32Array(2048 * 3), []);
  const geometry = useRef<import("three").BufferGeometry>(null);
  const pathGeometry = useRef<import("three").BufferGeometry>(null);
  const pathPoints = useMemo(() => new Float32Array(2048 * 3), []);
  useFrame(() => {
    if (!geometry.current || !trail) return;
    const count = Math.min(points.length, 2048);
    for (let i = 0; i < count; i++) { linePoints[i * 3] = points[i].x; linePoints[i * 3 + 1] = platformElevation(points[i].x) + 0.025; linePoints[i * 3 + 2] = points[i].y; }
    geometry.current.setDrawRange(0, count); geometry.current.attributes.position.needsUpdate = true;
    if (pathGeometry.current) {
      const path = session.presentation.current.path;
      const player = session.presentation.current.actors.get("player");
      pathPoints[0] = player?.x ?? 0; pathPoints[1] = (player?.elevation ?? 0) + 0.03; pathPoints[2] = player?.z ?? 0;
      const pathCount = Math.min(path.length, 2047);
      for (let i = 0; i < pathCount; i++) { pathPoints[(i + 1) * 3] = path[i].x; pathPoints[(i + 1) * 3 + 1] = platformElevation(path[i].x) + 0.03; pathPoints[(i + 1) * 3 + 2] = path[i].z; }
      pathGeometry.current.setDrawRange(0, path.length ? pathCount + 1 : 0); pathGeometry.current.attributes.position.needsUpdate = true;
    }
  });
  return <group>
    {vision && [...session.presentation.current.actors.values()].filter((actor) => actor.kind === "guard").map((actor) => <GuardVision key={actor.id} id={actor.id} session={session} />)}
    {vision && player && <mesh position={[player.x, (player.elevation ?? 0) + 0.02, player.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[11.96, 12, 64]} /><meshBasicMaterial color="#315c65" transparent opacity={0.6} depthWrite={false} />
    </mesh>}
    {trail && <line>
      <bufferGeometry ref={geometry}><bufferAttribute attach="attributes-position" args={[linePoints, 3]} /></bufferGeometry>
      <lineBasicMaterial color="#315c65" transparent opacity={0.6} />
    </line>}
    {trail && <line><bufferGeometry ref={pathGeometry}><bufferAttribute attach="attributes-position" args={[pathPoints, 3]} /></bufferGeometry><lineBasicMaterial color="#c69a44" /></line>}
  </group>;
}

/** 为正式站厅建立环境反射与分区照明，并按当前画质控制阴影。 */
function StationLighting({ standard }: { standard: boolean }) {
  const { gl, scene } = useThree();
  const target = useMemo(() => { const node = new Object3D(); node.position.set(35, 0, 15); return node; }, []);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl), room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.04); const old = scene.environment;
    scene.environment = map.texture; scene.environmentIntensity = 0.45;
    room.dispose(); pmrem.dispose();
    return () => { scene.environment = old; map.dispose(); };
  }, [gl, scene]);
  return <>
    <hemisphereLight args={["#fff2d9", "#a1a28f", 1.1]} />
    <ambientLight intensity={0.55} />
    <primitive object={target} />
    <directionalLight target={target} color="#ffe5bf" position={[18, 9, -16]} intensity={2.3} castShadow={standard} shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={110} shadow-normalBias={0.035} />
    {[8, 24, 39, 63].map((x) => <pointLight key={x} color="#ffdeb2" position={[x, STATION_CEILING - 0.45, 15]} intensity={28} distance={23} decay={2} />)}
  </>;
}

/** 组合正式站厅、性能设置与两组角色外观，分别反馈站厅和角色资源错误。 */
function Contents(props: SceneProps) {
  const { session, metrics } = props;
  const { gl } = useThree();
  const wasSampling = useRef(false);
  useEffect(() => {
    const context = gl.getContext();
    const extension = context.getExtension("WEBGL_debug_renderer_info");
    metrics.environment = { gpu: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER), userAgent: navigator.userAgent, dpr: gl.getPixelRatio(), width: gl.domElement.width, height: gl.domElement.height, quality: props.quality };
    /** 将图形上下文丢失转为可恢复提示。 */
    const lost = (event: Event) => { event.preventDefault(); props.onFailure("图形上下文已丢失。可重试三维画面，或使用二维调试继续查看本局。"); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, metrics, props.quality, props.onFailure]);
  useFrame((_, delta) => {
    metrics.environment.actors = session.presentation.current.actors.size;
    metrics.environment.width = gl.domElement.width; metrics.environment.height = gl.domElement.height;
    metrics.environment.dpr = gl.getPixelRatio();
    metrics.environment.targetFps = props.targetFps;
    metrics.environment.simpleCrowd = Number(props.simpleCrowd);
    metrics.environment.drawCalls = gl.info.render.calls;
    metrics.environment.triangles = gl.info.render.triangles;
    metrics.environment.geometries = gl.info.memory.geometries; metrics.environment.textures = gl.info.memory.textures;
    metrics.environment.renderedFrames = Number(metrics.environment.renderedFrames ?? 0) + 1;
    const sampling = metrics.active;
    if (sampling && wasSampling.current) metrics.push(delta);
    wasSampling.current = metrics.active;
    // 唤醒后的首帧不包含休眠时长；采样完成只通知一次，不恢复空闲轮询。
    if (sampling && !metrics.active) queueMicrotask(() => session.notify());
  });
  const actors = [...session.presentation.current.actors.values()];
  return <>
    <RenderSchedule session={session} targetFps={props.targetFps} metrics={metrics} />
    <color attach="background" args={["#e9e1cf"]} />
    <StationLighting standard={props.quality === "standard"} />
    <CameraRig session={session} settings={props.camera} reducedMotion={props.reducedMotion} />
    <Station session={session} reducedMotion={props.reducedMotion} overview={props.camera.mode === "overview"} standard={props.quality === "standard"} onAssetError={props.onStationAssetError} />
    {props.simpleCrowd && <SimpleCrowd key={session.generation} session={session} capacity={Math.max(64, Math.ceil(actors.length / 64) * 64)} />}
    {actors.filter((actor) => !props.simpleCrowd || actor.kind === "player" || actor.kind === "guard").map((actor) => <Character key={`${session.generation}-${actor.id}`} id={actor.id} kind={actor.kind} session={session} assetUrl={actor.kind === "guard" ? props.guardAssetUrl : props.assetUrl} assetRotation={actor.kind === "guard" ? props.guardAssetRotation : props.assetRotation} onAssetError={actor.kind === "guard" ? props.onGuardAssetError : props.onAssetError} reducedMotion={props.reducedMotion} />)}
    <DebugGround key={session.generation} session={session} vision={props.showVision} trail={props.showTrail} />
  </>;
}

/** 使用按需绘制；画质变化时重建图形上下文，确保抗锯齿设置确实生效。 */
export default function GameScene(props: SceneProps) {
  return <Canvas key={props.quality} frameloop="demand" shadows={props.quality === "standard"} dpr={props.quality === "low" ? 1 : [1, 1.5]} gl={{ antialias: props.quality === "standard", powerPreference: "high-performance" }} camera={{ position: [-2, 2.5, 15], fov: 58 }} fallback={<span>三维地铁站。无法显示时可使用二维调试地图。</span>}>
    <Contents {...props} />
  </Canvas>;
}
