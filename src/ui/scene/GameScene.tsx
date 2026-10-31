import type { DepartureAudio } from "../departureAudio";
import { CONTROL_ROOM_LIGHTING, stationLightBlend } from "./controlRoomLighting";
import type { AmbientLight, DirectionalLight, HemisphereLight, PointLight } from "three";
import { ControlRoom, type RoomAction } from "./ControlRoom";
import { controlRoomState, entranceDock } from "./controlRoomLayout";
import type { JourneyStage } from "../journeyFlow";
import { worldViewBounds } from "../../sim/entranceGeometry";
import { AlertBadge, SceneItems } from "./Interactions";
import { MessageBillboardLayout } from "./MessageBillboardLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei/core/Progress";
import { Box3, Object3D, OrthographicCamera, PerspectiveCamera, PMREMGenerator, Vector3, type Mesh } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { WIDTH } from "../../sim/layout";
import { platformElevation } from "../presentation";
import { RULES } from "../../sim/scenario";
import type { GameSession } from "../gameSession";
import type { FrameMetrics } from "../frameMetrics";
import { sampleActor } from "../presentation";
import { Station } from "./Station";
import { MetroPlatform } from "./MetroPlatform";
import { Character } from "./Character";
import { SimpleCrowd } from "./SimpleCrowd";
import { FollowCamera } from "./followCamera";
import { cameraFraction } from "./cameraCollision";
import { STATION_CEILING } from "../../assets/station-kit/dimensions";
import { getScenePerformance } from "./scenePerformance";
import { VictoryCamera } from "./victoryCamera";
import { constrainCabinCamera } from "./trainCabin";
import type { HeadMessageMode } from "../headMessages";

export interface CameraSettings { mode: "follow" | "overview"; reset: number; command?: number; shot?: "lobby" | "character" | "guidance" | "plan" | "launch"; }
export interface SceneProps {
  session: GameSession;
  stage: JourneyStage;
  launchReady: boolean;
  fastEntry: boolean;
  audio:DepartureAudio;
  onRoomAction: (action:RoomAction)=>void;
  camera: CameraSettings;
  quality: "standard" | "low";
  targetFps: 60 | 30 | 15;
  simpleCrowd: boolean;
  reducedMotion: boolean;
  assetUrl: string;
  greetingRequest?: string;
  assetRotation: number;
  guardAssetUrl: string;
  guardAssetRotation: number;
  onAssetError: (message: string, url?: string) => void;
  onModelLoadStart: (url: string) => void;
  onModelProgress: (progress: number) => void;
  onModelLoaded: (url: string) => void;
  onGuardAssetError: (message: string) => void;
  onStationAssetError: (message: string) => void;
  onFailure: (message: string) => void;
  metrics: FrameMetrics;
  showVision: boolean;
  showTrail: boolean;
  onCameraReady?: () => void;
  thought?: "thinking" | "ready" | null;
  messageMode?: HeadMessageMode;
}

/** 按目标频率唤醒按需渲染；空闲或隐藏时休眠，阶段与采样变化可立即唤醒。 */
function RenderSchedule({ session, targetFps, metrics, reducedMotion, stage }: Pick<SceneProps, "session" | "targetFps" | "metrics" | "reducedMotion" | "stage">) {
  const { invalidate, gl } = useThree();
  const performanceState = getScenePerformance(session);
  // 先推进展示秒表，再让角色和相机采样；不使用 R3F 的累计运行时间。
  useFrame((_, delta) => { getScenePerformance(session).advance(delta, reducedMotion); }, -2);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let intersects = true;
    const interval = 1000 / targetFps;
    /** 世界运行或可见的展示动画需要连续帧，终局不用恢复模拟循环。 */
    const active = () => !session.frozen || metrics.active || performanceState.needsFrames(reducedMotion) || stage === "launch";
    /** 按目标帧率补绘；隐藏和视口之外停止续订。 */
    const frame = (now: number) => {
      raf = 0;
      if (!performanceState.visible || !active()) return;
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
      getScenePerformance(session);
      if (!performanceState.visible) return;
      invalidate(); last = performance.now();
      if (active()) raf = requestAnimationFrame(frame);
    };
    /** 可见性切换时丢弃休眠间隔，重新出现后继续原来的动作进度。 */
    const visibility = () => { performanceState.setVisible(!document.hidden && intersects); wake(); };
    const observer = new IntersectionObserver(([entry]) => { intersects = entry.isIntersecting; visibility(); });
    observer.observe(gl.domElement);
    const unsubscribe = session.subscribe(wake);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => { unsubscribe(); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); cancelAnimationFrame(raf); performanceState.setVisible(false); };
  }, [session, targetFps, metrics, invalidate, gl, reducedMotion, performanceState, stage]);
  return null;
}

/** 编排准备、跟随、总览和胜利镜头，并在开局就位后通知旅程流程。 */
function CameraRig({ session, settings, reducedMotion, assetRotation, onReady, stage, launchReady, fastEntry }: { session: GameSession; settings: CameraSettings; reducedMotion: boolean; assetRotation: number; onReady?: () => void; stage:JourneyStage; launchReady:boolean; fastEntry:boolean }) {
  const viewBounds=worldViewBounds(session.engine.world.definition),WIDTH=viewBounds.w,HEIGHT=viewBounds.h;
  const centerX=viewBounds.x+WIDTH/2, centerY=viewBounds.y+HEIGHT/2;
  const { gl, size, set, get, invalidate, scene } = useThree();
  const dock = useMemo(()=>entranceDock(session.engine.world.definition),[session.engine.world.definition]);
  const room = controlRoomState(session);
  const warm = useRef({key:"",time:0,compiled:false});
  const worldTarget = useMemo(()=>new Vector3(),[]);
  const cameras = useMemo(() => ({ follow: new PerspectiveCamera(58, 1, 0.08, 240), overview: new OrthographicCamera(-50, 50, 30, -30, 0.1, 240) }), []);
  const orbit = useRef({ yaw: 0, pitch: 0.16, distance: 4.2 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean; pointer: number } | null>(null);
  const pose = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  const follow = useMemo(() => new FollowCamera(), []);
  const vectors = useMemo(() => ({ target: new Vector3(), desired: new Vector3(), eye: new Vector3(), anchor: new Vector3() }), []);
  const initial = useRef(true);
  const cameraInitialized = useRef(false);
  const readyKey = useRef("");
  const assetsLoading = useProgress(state => state.active);
  useEffect(() => { invalidate(); }, [assetsLoading, invalidate]);
  const performanceState = getScenePerformance(session);
  const cinematic = performanceState.cinematic;
  const victory = useMemo(() => new VictoryCamera(), [session.generation]);
  const activeVictory = useRef<VictoryCamera | null>(null);
  const manualTarget = useMemo(() => new Vector3(), []);
  const manualReady = useRef(false);
  const direction = useMemo(() => new Vector3(), []);
  const previousSettings = useRef(settings);
  // 模式按钮或回正明确表示手动接管，尺寸变化和画质重建不打断运镜。
  useEffect(() => {
    if (previousSettings.current.command !== settings.command || previousSettings.current.reset !== settings.reset) {
      if (session.engine.player.onTrain) performanceState.restoreCamera();
      else performanceState.dismissCamera();
    }
    previousSettings.current = settings;
  }, [settings, performanceState, session]);
  useEffect(() => {
    const active = cameras[cinematic ? "follow" : settings.mode];
    const current = get().camera;
    if (cinematic && active !== current) { active.position.copy(current.position); active.quaternion.copy(current.quaternion); }
    if (active instanceof PerspectiveCamera) {
      active.aspect = size.width / Math.max(1, size.height);
      // 手动观看保留当前电影焦距，避免开始拖动的一帧突然缩放。
      if (performanceState.victoryAt === null) active.fov = 58;
    }
    else {
      const aspect = size.width / Math.max(1, size.height);
      const halfHeight = Math.max(28, (WIDTH / 2 + HEIGHT * 0.4) / aspect); const halfWidth = halfHeight * aspect;
      active.left = -halfWidth; active.right = halfWidth; active.top = halfHeight; active.bottom = -halfHeight;
    }
    active.updateProjectionMatrix(); set({ camera: active }); initial.current = true;
  }, [cameras, set, get, settings.mode, size.width, size.height, cinematic, performanceState, WIDTH, HEIGHT, session.generation]);
  useEffect(() => { orbit.current = { yaw: 0, pitch: 0.16, distance: 4.2 }; follow.reset(); initial.current = true; manualReady.current = false; invalidate(); }, [settings.reset, settings.shot, session.generation, follow, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    /** 手动拖动从电影镜头当前位置接续，不突然跳回角色背后。 */
    const takeControl = (held: boolean) => {
      if (performanceState.victoryAt === null) return;
      if (performanceState.cinematic || !manualReady.current) {
        const camera = get().camera;
        sampleActor(session.presentation, "player", session.alpha, pose.current);
        if (activeVictory.current === victory) manualTarget.copy(victory.target);
        else manualTarget.set(pose.current.x, pose.current.y + 0.95, pose.current.z);
        const dx = camera.position.x - manualTarget.x, dy = camera.position.y - manualTarget.y, dz = camera.position.z - manualTarget.z;
        const distance = Math.max(2.2, Math.min(14, Math.hypot(dx, dy, dz)));
        orbit.current = { yaw: Math.atan2(-dx, -dz) - pose.current.yaw, distance,
          pitch: Math.asin(Math.max(-1, Math.min(1, dy / distance))) };
        manualReady.current = true;
      }
      performanceState.interactCamera(held);
    };
    /** 记录跟随相机的拖动起点。 */
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (performanceState.victoryAt === null && settings.shot && settings.shot !== "launch") || (!performanceState.cinematic && settings.mode !== "follow")) return;
      // 重新按住已经进入自由观看的胜利镜头时，暂停待恢复倒计时。
      if (performanceState.victoryAt !== null && !performanceState.cinematic) performanceState.interactCamera(true);
      drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, pointer: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    };
    /** 拖动调整环绕角度，并唤醒静止画面。 */
    const move = (event: PointerEvent) => {
      if (!drag.current || drag.current.pointer !== event.pointerId) return;
      if (!drag.current.moved && Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) <= 6) return;
      drag.current.moved = true; takeControl(true);
      orbit.current.yaw -= (event.clientX - drag.current.x) * 0.006;
      const victoryView = performanceState.victoryAt !== null;
      orbit.current.pitch = Math.max(victoryView ? -0.15 : -0.04, Math.min(victoryView ? 1.15 : 0.65, orbit.current.pitch + (event.clientY - drag.current.y) * 0.004));
      drag.current.x = event.clientX; drag.current.y = event.clientY;
      invalidate();
    };
    /** 结束或取消拖动，松开后才启动四秒静置恢复。 */
    const up = () => { drag.current = null; performanceState.releaseCamera(); invalidate(); };
    /** 缩放跟随镜头，并唤醒静止画面。 */
    const wheel = (event: WheelEvent) => {
      if ((performanceState.victoryAt === null && settings.shot) || (!performanceState.cinematic && settings.mode !== "follow")) return;
      takeControl(!!drag.current);
      event.preventDefault(); orbit.current.distance = Math.max(2.2, Math.min(performanceState.victoryAt === null ? 9 : 14, orbit.current.distance + event.deltaY * 0.006));
      invalidate();
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up); window.addEventListener("blur", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up); window.removeEventListener("blur", up); canvas.removeEventListener("wheel", wheel); drag.current = null; performanceState.releaseCamera(); };
  }, [gl, get, settings.mode, settings.shot, invalidate, performanceState, session, victory, manualTarget]);
  useFrame((state, delta) => {
    state.camera.parent?.updateWorldMatrix(true,true);
    const warmKey=`${session.generation}:${settings.reset}`;
    if(warm.current.key!==warmKey)warm.current={key:warmKey,time:0,compiled:false};
    const hasStation=!!scene.getObjectByName("generated-station")||session.engine.world.definition.generatorVersion==="legacy-v0";
    const resourcesReady=stage==="launch"&&launchReady&&!assetsLoading&&hasStation&&!scene.getObjectByName("station-kit-loading");
    if(resourcesReady){
      warm.current.time+=performanceState.delta;
      if(!warm.current.compiled){gl.compile(scene,state.camera);warm.current.compiled=true;}
    }else warm.current.time=0;
    room.update(stage,performanceState.delta,resourcesReady&&warm.current.time>.3,fastEntry,dock,size.width<600);
    if(stage!=="watch"){
      if(state.camera instanceof PerspectiveCamera&&state.camera.fov!==room.fov){state.camera.fov=room.fov;state.camera.updateProjectionMatrix();}
      state.camera.position.copy(room.eye).applyMatrix4(dock.inverse);state.camera.lookAt(room.target);cameraInitialized.current=true;
      if(room.moving&&stage!=="launch")invalidate();
      if(stage==="launch"&&room.complete&&!room.notified){room.notified=true;room.handoff=true;queueMicrotask(()=>onReady?.());}
      return;
    }
    if (performanceState.cinematic) {
      sampleActor(session.presentation, "player", session.alpha, pose.current);
      if (activeVictory.current !== victory) {
        const focusDistance = manualReady.current ? state.camera.position.distanceTo(manualTarget) : 4.2;
        victory.capture(state.camera.position, state.camera.getWorldDirection(direction).transformDirection(dock.inverse), performanceState.victoryTime, (state.camera as PerspectiveCamera).fov ?? 45, focusDistance);
        activeVictory.current = victory;
      }
      victory.update(pose.current, performanceState.victoryTime, size.width / Math.max(1, size.height), reducedMotion, assetRotation, session.engine.player.onTrain, size.height, session.engine.world.definition);
      const camera = state.camera as PerspectiveCamera;
      if (Math.abs(camera.fov - victory.fov) > 0.001) { camera.fov = victory.fov; camera.updateProjectionMatrix(); }
      camera.position.copy(victory.position); camera.lookAt(worldTarget.copy(victory.target).applyMatrix4(dock.matrix)); return;
    }
    activeVictory.current = null;
    const { target, desired, eye, anchor } = vectors;
    if (settings.mode === "overview") {
      state.camera.position.set(centerX - 28, 62, viewBounds.y + HEIGHT + 28); state.camera.lookAt(worldTarget.set(centerX,-.5,centerY).applyMatrix4(dock.matrix)); return;
    }
    // 大厅展示车站全景；选角时重新初始化角色镜头，避免从远处穿越设施。
    if (settings.shot === "lobby") {
      if (size.width <= 600) {
        state.camera.position.set(38, 2.8, 8);
        state.camera.lookAt(51, 0.6, 19);
      } else {
        state.camera.position.set(36.5, 2.8, 16.3);
        state.camera.lookAt(50, 0.5, 14.5);
      }
      cameraInitialized.current = false;
      return;
    }
    sampleActor(session.presentation, "player", session.alpha, pose.current);
    if (performanceState.victoryAt !== null && manualReady.current) {
      // 胜利自由观看使用球面环绕，可完整转身、抬高/降低及缩放；保留碰撞和地面约束。
      const yaw = pose.current.yaw + orbit.current.yaw, horizontal = orbit.current.distance * Math.cos(orbit.current.pitch);
      desired.set(manualTarget.x - Math.sin(yaw) * horizontal,
        Math.max(pose.current.y + 0.25, manualTarget.y + Math.sin(orbit.current.pitch) * orbit.current.distance),
        manualTarget.z - Math.cos(yaw) * horizontal);
      if (session.engine.player.onTrain) {
        constrainCabinCamera(desired, pose.current, session.engine.world.definition);
        state.camera.position.copy(desired); state.camera.lookAt(worldTarget.copy(manualTarget).applyMatrix4(dock.matrix)); return;
      }
      desired.y = Math.max(desired.y, platformElevation(desired.x) + 0.25);
      // 新站台边缘外是列车与轨道，自由缩放也不把镜头推进车体内。
      const edgeFraction = desired.x > WIDTH - 0.3 ? (WIDTH - 0.3 - manualTarget.x) / (desired.x - manualTarget.x) : 1;
      const fraction = Math.min(cameraFraction(manualTarget, desired, session.engine.world.definition), Math.max(0.05, edgeFraction));
      state.camera.position.lerpVectors(manualTarget, desired, fraction); state.camera.lookAt(worldTarget.copy(manualTarget).applyMatrix4(dock.matrix)); return;
    }
    target.set(pose.current.x, 1.25 + pose.current.y, pose.current.z);
    anchor.copy(target);
    if (settings.shot && settings.shot !== "launch") {
      const angle = pose.current.yaw;
      desired.set(target.x - Math.sin(angle) * 4.5, target.y + 0.25, target.z - Math.cos(angle) * 4.5);
      const narrow = size.width < 600;
      target.x -= Math.cos(angle) * (narrow ? 0 : 1.4);
      target.z += Math.sin(angle) * (narrow ? 0 : 1.4);
      if (narrow) target.y -= 0.9;
      const fraction = cameraFraction(anchor, desired, session.engine.world.definition);
      eye.copy(anchor).lerp(desired, fraction);
      if (!cameraInitialized.current || reducedMotion || fraction < 0.99) state.camera.position.copy(eye);
      else state.camera.position.lerp(eye, 1 - Math.exp(-delta * 12));
      const safeFraction = cameraFraction(anchor, state.camera.position, session.engine.world.definition);
      if (safeFraction < 1) state.camera.position.lerpVectors(anchor, state.camera.position, safeFraction);
      state.camera.lookAt(worldTarget.copy(target).applyMatrix4(dock.matrix));
      cameraInitialized.current = true;
      if (session.frozen && state.camera.position.distanceToSquared(eye) > 0.00001) invalidate();
      return;
    }
    follow.update(pose.current, orbit.current, delta, initial.current, reducedMotion, session.engine.world.definition);
    initial.current = false;
    eye.set(follow.position.x, follow.position.y, follow.position.z);
    target.set(follow.target.x, follow.target.y, follow.target.z);
    if (size.width < 600) target.y -= 0.55;
    if ((room.handoff || settings.shot === "launch" && !reducedMotion) && cameraInitialized.current) {
      state.camera.position.lerp(eye, 1 - Math.exp(-delta * 12));
      const safeFraction = cameraFraction(anchor, state.camera.position, session.engine.world.definition);
      if (safeFraction < 1) state.camera.position.lerpVectors(anchor, state.camera.position, safeFraction);
    } else state.camera.position.copy(eye);
    worldTarget.copy(target).applyMatrix4(dock.matrix);
    if(room.handoff){room.target.lerp(worldTarget,1-Math.exp(-delta*12));state.camera.lookAt(room.target);}else state.camera.lookAt(worldTarget);
    cameraInitialized.current = true;
    const key = `${settings.reset}:${settings.shot}`;
    if (settings.shot === "launch" && !assetsLoading && readyKey.current !== key && state.camera.position.distanceToSquared(eye) < 0.0001 && follow.settled) {
      readyKey.current = key; queueMicrotask(() => onReady?.());
    }
    if (session.frozen && (!follow.settled || state.camera.position.distanceToSquared(eye) > 0.00001)) invalidate();
  });
  return <group matrix={dock.matrix} matrixAutoUpdate={false}><primitive object={cameras.follow}/><primitive object={cameras.overview}/></group>;
}

/** 让键盘用户在画布聚焦后按 Enter/空格触发与点击相同的问候。 */
function CharacterKeyboard({ session, reducedMotion }: Pick<SceneProps, "session" | "reducedMotion">) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    /** 忽略自动连发，避免按住按键重复排队播放。 */
    const greet = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault(); getScenePerformance(session).greet(reducedMotion);
    };
    canvas.tabIndex = 0; canvas.setAttribute("aria-label", "三维地铁站，按 Enter 或空格向角色打招呼");
    canvas.addEventListener("keydown", greet);
    return () => { canvas.removeEventListener("keydown", greet); canvas.removeAttribute("tabindex"); canvas.removeAttribute("aria-label"); };
  }, [canvas, session, reducedMotion]);
  return null;
}

/** 绘制开发用保安视距示意，不参与实际发现判定。 */
function GuardVision({ id, session }: { id: string; session: GameSession }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    const actor = session.presentation.current.actors.get(id);
    if (mesh.current && actor) { mesh.current.position.set(actor.x, 0.018, actor.z); mesh.current.rotation.set(-Math.PI / 2, 0, actor.yaw - Math.PI / 2); }
  });
  const actor = session.engine.guards.guards.find((g) => g.def.id === id);
  const vision = actor ? session.engine.guards.vision(actor) : { fov: RULES.guardFovDeg, range: RULES.guardRange };
  const half = vision.fov * Math.PI / 360;
  const range = vision.range;
  return <mesh ref={mesh}><circleGeometry args={[range, 40, -half, half * 2]} /><meshBasicMaterial color="#7f9485" transparent opacity={0.18} depthWrite={false} /></mesh>;
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
    for (let i = 0; i < count; i++) { linePoints[i * 3] = points[i].x; linePoints[i * 3 + 1] = ((points[i] as import("../../shared/types").TrailPoint).elevation ?? (session.engine.world.definition.generatorVersion!=="legacy-v0"?(points[i].floorId==="platform"?-6:0):platformElevation(points[i].x))) + 0.025; linePoints[i * 3 + 2] = points[i].y; }
    geometry.current.setDrawRange(0, count); geometry.current.attributes.position.needsUpdate = true;
    if (pathGeometry.current) {
      const path = session.presentation.current.path;
      const player = session.presentation.current.actors.get("player");
      pathPoints[0] = player?.x ?? 0; pathPoints[1] = (player?.elevation ?? 0) + 0.03; pathPoints[2] = player?.z ?? 0;
      const pathCount = Math.min(path.length, 2047);
      for (let i = 0; i < pathCount; i++) { pathPoints[(i + 1) * 3] = path[i].x; pathPoints[(i + 1) * 3 + 1] = (session.engine.world.definition.generatorVersion!=="legacy-v0"?0:platformElevation(path[i].x)) + 0.03; pathPoints[(i + 1) * 3 + 2] = path[i].z; }
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
function StationLighting({ standard,session }: { standard: boolean;session:GameSession }) {
  const l=session.engine.world.layout;
  const side=session.engine.world.definition.archetype==="side";
  const points=session.engine.world.definition.generatorVersion!=="legacy-v0"?Array.from({length:Math.floor((side?l.HEIGHT:l.WIDTH)/12)},(_,i)=>side?[l.WIDTH/2,6+i*12]:[6+i*12,l.HEIGHT/2]):[8,24,39,56,76,WIDTH-3].map(x=>[x,15]);
  const { gl, scene } = useThree();
  const hemisphere=useRef<HemisphereLight>(null),ambient=useRef<AmbientLight>(null),sun=useRef<DirectionalLight>(null),lamps=useRef<(PointLight|null)[]>([]);
  useFrame(()=>{
    const blend=stationLightBlend(controlRoomState(session)),room=CONTROL_ROOM_LIGHTING,blackout=session.presentation.current.blackout.active;
    if(hemisphere.current)hemisphere.current.intensity=room.hemisphere+((blackout ? .22 : 1.1)-room.hemisphere)*blend;
    if(ambient.current)ambient.current.intensity=room.ambient+((blackout ? .12 : .55)-room.ambient)*blend;
    if(sun.current){sun.current.intensity=(blackout ? .35 : 2.3)*blend;}
    for(const light of lamps.current)if(light){light.intensity=(blackout ? 2 : 28)*blend;}
    scene.environmentIntensity=room.environment+(.45-room.environment)*blend;
  });
  const target = useMemo(() => { const node = new Object3D(); node.position.set(l.WIDTH / 2, 0, l.HEIGHT / 2); return node; }, [l.WIDTH, l.HEIGHT]);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl), room = new RoomEnvironment();
    const map = pmrem.fromScene(room, 0.04); const old = scene.environment;
    scene.environment = map.texture; scene.environmentIntensity = 0.45;
    room.dispose(); pmrem.dispose();
    return () => { scene.environment = old; map.dispose(); };
  }, [gl, scene]);
  return <>
    <hemisphereLight ref={hemisphere} name="station-hemisphere" args={["#fff2d9", "#a1a28f", CONTROL_ROOM_LIGHTING.hemisphere]} />
    <ambientLight ref={ambient} name="station-ambient" intensity={CONTROL_ROOM_LIGHTING.ambient} />
    <primitive object={target} />
    <directionalLight ref={sun} name="station-key" target={target} color="#ffe5bf" position={[18, 9, -16]} intensity={2.3} castShadow={standard} shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={110} shadow-normalBias={0.035} />
    {points.map(([x,z],index) => <pointLight ref={light=>{lamps.current[index]=light;}} key={`${x}:${z}`} color="#ffdeb2" position={[x, STATION_CEILING - 0.45, z]} intensity={28} distance={23} decay={2} />)}
  </>;
}

/** 组合正式站厅、性能设置与两组角色外观，分别反馈站厅和角色资源错误。 */
function Contents(props: SceneProps) {
  const invalidate = useThree(state => state.invalidate);
  // 暂停时也要刷新头顶信息，不能等待模拟器下一次推进。
  useEffect(() => { invalidate(); }, [props.messageMode, props.thought, invalidate]);
  const { session, metrics } = props;
  const { gl, get } = useThree();
  const { progress } = useProgress();
  const wasSampling = useRef(false);
  useEffect(() => {
    if (props.assetUrl) props.onModelProgress(progress);
  }, [progress, props.assetUrl, props.onModelProgress]);
  // 沿用现有 debug=1 的只读验收入口，不提供改写世界或强制胜利的方法。
  useEffect(() => {
    if (new URLSearchParams(location.search).get("debug") !== "1") return;
    /** 返回实际展示状态、屏幕位置和关键骨骼，便于核对真实渲染而非仅计时器。 */
    const inspect = () => {
      const performance = getScenePerformance(session), { camera, scene } = get();
      const root = scene.getObjectByName("actor-player"), bones: Record<string, number[]> = {};
      root?.traverse((node) => { if ("isBone" in node && /Hips|Head$|RightArm$|LeftLeg$/.test(node.name)) bones[node.name] = [...node.position.toArray(), ...node.quaternion.toArray()]; });
      const point = root ? root.getWorldPosition(new Vector3()).add(new Vector3(0, 0.9, 0)).project(camera) : new Vector3();
      const rect = gl.domElement.getBoundingClientRect();
      const brand=scene.getObjectByName("lounge-brand"),brandBox=brand?new Box3().setFromObject(brand):null;
      const project=(v:Vector3)=>{v.project(camera);return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2};};
      return { generation: session.generation, t: session.engine.t, status: session.engine.status, displayTime: performance.time,
        visible: performance.visible, dance: performance.dance, danceTime: performance.danceTime, previousDance: performance.previousDance, victoryTime: performance.victoryTime, greetingTime: performance.greetingTime,
        defeatTime: performance.defeatTime, defeatDuration: performance.defeatDuration,
        greetingRequest: props.greetingRequest, greetingDuration: performance.greetingDuration, greetingImmediate: performance.greetingImmediate,
        lighting:{stationBlend:stationLightBlend(controlRoomState(session)),environment:scene.environmentIntensity,exposure:gl.toneMappingExposure,roomKey:(scene.getObjectByName("control-room-key") as DirectionalLight|undefined)?.intensity},cinematic: performance.cinematic, cameraResumeIn: performance.cameraResumeIn, reducedMotion: props.reducedMotion, camera: camera.position.toArray(), fov: (camera as PerspectiveCamera).fov,
        lounge:{brand:brandBox?{min:project(brandBox.min.clone()),max:project(brandBox.max.clone())}:null,roomMeshes:scene.getObjectByName("departure-control-room")?.children.length},resources:{geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,drawCalls:gl.info.render.calls},actorUuid:root?.uuid,cameraUuid:camera.uuid,quaternion:camera.quaternion.toArray(),position: root?.position.toArray(), scenePosition:root?.getWorldPosition(new Vector3()).toArray(), cameraWorld:camera.getWorldPosition(new Vector3()).toArray(), entry:{stage:props.stage,elapsed:controlRoomState(session).elapsed,door:controlRoomState(session).door,hash:session.engine.world.definition.layoutHash}, bones, screen: { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 } };
    };
    const target = window as typeof window & { victoryInspect?: typeof inspect }; target.victoryInspect = inspect;
    return () => { if (target.victoryInspect === inspect) delete target.victoryInspect; };
  }, [get, gl, session, props.reducedMotion, props.stage, props.greetingRequest]);
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
    const intro=controlRoomState(session);props.audio.update(intro.active?intro.time:session.visualTime,intro.active?intro.walking:session.presentation.current.actors.get("player")?.motion==="walk",intro.door);
    // 唤醒后的首帧不包含休眠时长；采样完成只通知一次，不恢复空闲轮询。
    if (sampling && !metrics.active) queueMicrotask(() => session.notify());
  });
  const actors = [...session.presentation.current.actors.values()];
  const performanceState = getScenePerformance(session);
  const dock=useMemo(()=>entranceDock(session.engine.world.definition),[session.engine.world.definition]);
  const stationMounted=props.stage==="launch"||props.stage==="watch";
  return <>
    <RenderSchedule stage={props.stage} session={session} targetFps={props.targetFps} metrics={metrics} reducedMotion={props.reducedMotion} />
    <CharacterKeyboard session={session} reducedMotion={props.reducedMotion} />
    <color attach="background" args={["#e9e1cf"]} />
    <CameraRig session={session} settings={props.camera} reducedMotion={props.reducedMotion} assetRotation={props.assetRotation} onReady={props.onCameraReady} stage={props.stage} launchReady={props.launchReady} fastEntry={props.fastEntry}/>
    <ControlRoom session={session} standard={props.quality==="standard"} active={props.stage!=="watch"}/>
    <group name="station-world-root" matrix={dock.matrix} matrixAutoUpdate={false}>
    <StationLighting session={session} standard={props.quality === "standard"} />
    {stationMounted&&<Station session={session} generation={session.generation} overview={!performanceState.cinematic && props.camera.mode === "overview"} standard={props.quality === "standard"} reducedMotion={props.reducedMotion} onAssetError={props.onStationAssetError} />}
    {stationMounted&&actors.map(a=><AlertBadge key={a.id} id={a.id} session={session} messageMode={props.messageMode} thought={a.id === "player" ? props.thought : null}/>)}
    {stationMounted&&<MessageBillboardLayout />}
    {stationMounted&&session.engine.world.definition.generatorVersion === "legacy-v0"&&<MetroPlatform overview={!performanceState.cinematic && props.camera.mode === "overview"} standard={props.quality === "standard"} onAssetError={props.onStationAssetError} />}
    {stationMounted&&<SceneItems session={session}/>}
    {stationMounted && props.simpleCrowd && <SimpleCrowd key={`crowd-${session.generation}`} session={session} capacity={Math.max(64, Math.ceil(actors.length / 64) * 64)} />}
    {actors.filter((actor) => actor.kind === "player" || stationMounted && (!props.simpleCrowd || actor.kind === "guard")).map((actor) => <Character key={actor.id==="player"?"player":`${session.generation}-${actor.id}`} id={actor.id} kind={actor.kind} session={session} greetingRequest={actor.kind === "player" ? props.greetingRequest : undefined} assetUrl={actor.kind === "guard" ? props.guardAssetUrl : props.assetUrl} assetRotation={actor.kind === "guard" ? props.guardAssetRotation : props.assetRotation} onAssetError={actor.kind === "guard" ? props.onGuardAssetError : props.onAssetError} onModelLoadStart={actor.kind === "player" ? props.onModelLoadStart : undefined} onModelLoaded={actor.kind === "player" ? props.onModelLoaded : undefined} onSelect={actor.id==="player"&&props.stage!=="watch"&&props.stage!=="launch"?()=>props.onRoomAction("character"):undefined} reducedMotion={props.reducedMotion} />)}
    {stationMounted&&<DebugGround key={`ground-${session.generation}`} session={session} vision={props.showVision} trail={props.showTrail} />}
    </group>
  </>;
}

function UnsupportedScene({ onFailure }: { onFailure: (message: string) => void }) {
  useEffect(() => onFailure("浏览器无法建立三维画面，请重试或使用二维画面。"), [onFailure]);
  return null;
}

/** 使用按需绘制；画质变化时重建图形上下文，确保抗锯齿设置确实生效。 */
export default function GameScene(props: SceneProps) {
  const [quality,setQuality]=useState(props.quality);
  useEffect(()=>{if(props.stage!=="launch"&&!(props.stage==="watch"&&props.session.engine.player.activity.kind==="entering"))setQuality(props.quality);},[props.quality,props.stage,props.session.engine.player.activity.kind]);
  if (typeof WebGLRenderingContext === "undefined") return <UnsupportedScene onFailure={props.onFailure} />;
  return <Canvas key={quality} frameloop="demand" shadows={quality === "standard"} dpr={quality === "low" ? 1 : [1, 1.5]} gl={{ antialias: quality === "standard", powerPreference: "high-performance" }} camera={{ position: [-2, 2.5, 15], fov: 58 }} fallback={<span>三维地铁站。无法显示时可使用二维画面。</span>}>
    <Contents {...props} quality={quality} />
  </Canvas>;
}
