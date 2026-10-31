import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, Vector3, type Mesh } from "three";
import { WIDTH, HEIGHT } from "../../sim/layout";
import { platformElevation } from "../presentation";
import { RULES } from "../../sim/scenario";
import type { GameSession } from "../gameSession";
import type { FrameMetrics } from "../frameMetrics";
import { sampleActor } from "../presentation";
import { Station } from "./Station";
import { Character } from "./Character";
import { cameraFraction } from "./cameraCollision";

export interface CameraSettings { mode: "follow" | "overview"; reset: number; }
export interface SceneProps {
  session: GameSession;
  camera: CameraSettings;
  quality: "standard" | "low";
  reducedMotion: boolean;
  assetUrl: string;
  onAssetError: (message: string) => void;
  onFailure: (message: string) => void;
  metrics: FrameMetrics;
  showVision: boolean;
  showTrail: boolean;
}

function CameraRig({ session, settings, reducedMotion }: { session: GameSession; settings: CameraSettings; reducedMotion: boolean }) {
  const { gl, size, set } = useThree();
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
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || settings.mode !== "follow") return;
      drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag.current || drag.current.pointer !== event.pointerId) return;
      orbit.current.yaw -= (event.clientX - drag.current.x) * 0.006;
      orbit.current.pitch = Math.max(-0.04, Math.min(0.65, orbit.current.pitch + (event.clientY - drag.current.y) * 0.004));
      drag.current.x = event.clientX; drag.current.y = event.clientY;
    };
    const up = () => { drag.current = null; };
    const wheel = (event: WheelEvent) => {
      if (settings.mode !== "follow") return;
      event.preventDefault(); orbit.current.distance = Math.max(2.2, Math.min(9, orbit.current.distance + event.deltaY * 0.006));
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel); drag.current = null; };
  }, [gl, settings.mode]);
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
  });
  return null;
}

function GuardVision({ id, session }: { id: string; session: GameSession }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const actor = session.presentation.current.actors.get(id);
    if (mesh.current && actor) { mesh.current.position.set(actor.x, 0.018, actor.z); mesh.current.rotation.set(-Math.PI / 2, 0, actor.yaw - Math.PI / 2); }
  });
  const half = RULES.guardFovDeg * Math.PI / 360;
  return <mesh ref={mesh}><circleGeometry args={[RULES.guardRange, 40, -half, half * 2]} /><meshBasicMaterial color="#7f9485" transparent opacity={0.18} depthWrite={false} /></mesh>;
}

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

function Contents(props: SceneProps) {
  const { session, metrics } = props;
  const { gl } = useThree();
  useEffect(() => {
    const context = gl.getContext();
    const extension = context.getExtension("WEBGL_debug_renderer_info");
    metrics.environment = { gpu: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER), userAgent: navigator.userAgent, dpr: gl.getPixelRatio(), width: gl.domElement.width, height: gl.domElement.height, quality: props.quality };
    const lost = (event: Event) => { event.preventDefault(); props.onFailure("图形上下文已丢失。可重试三维画面，或使用二维调试继续查看本局。"); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, metrics, props.quality, props.onFailure]);
  useFrame((_, delta) => {
    metrics.environment.actors = session.presentation.current.actors.size;
    metrics.environment.width = gl.domElement.width; metrics.environment.height = gl.domElement.height;
    metrics.environment.dpr = gl.getPixelRatio();
    metrics.push(delta);
  });
  const actors = [...session.presentation.current.actors.values()];
  return <>
    <color attach="background" args={["#dddcd1"]} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[-8, 28, -12]} intensity={3} castShadow={props.quality === "standard"} shadow-mapSize={[1024, 1024]} shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={100} shadow-normalBias={0.04} />
    <CameraRig session={session} settings={props.camera} reducedMotion={props.reducedMotion} />
    <Station session={session} reducedMotion={props.reducedMotion} />
    {actors.map((actor) => <Character key={`${session.generation}-${actor.id}`} id={actor.id} kind={actor.kind} session={session} assetUrl={props.assetUrl} onAssetError={props.onAssetError} reducedMotion={props.reducedMotion} />)}
    <DebugGround key={session.generation} session={session} vision={props.showVision} trail={props.showTrail} />
  </>;
}

export default function GameScene(props: SceneProps) {
  return <Canvas shadows={props.quality === "standard"} dpr={props.quality === "low" ? 1 : [1, 1.5]} gl={{ antialias: props.quality === "standard", powerPreference: "high-performance" }} camera={{ position: [-2, 2.5, 15], fov: 58 }} fallback={<span>三维地铁站。无法显示时可使用二维调试地图。</span>}>
    <Contents {...props} />
  </Canvas>;
}
