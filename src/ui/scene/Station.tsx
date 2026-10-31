import { memo, useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, Group } from "three";
import { makeMaterials, setFacilityState, setGateProgress } from "../../assets/station-kit/index";
import { FACILITIES, HEIGHT, STAIRS_BOTTOM, STAIRS_TOP, WIDTH } from "../../sim/layout";
import { createSignTexture, SIGN_FACE } from "../../assets/station-kit/signs";
import { createFloorReflection, disposeFloorReflection } from "../../assets/station-kit/reflection";
import { STATION_CEILING } from "../../assets/station-kit/dimensions";
import { CONVEYOR } from "../../sim/facilityGeometry";
import type { GameSession } from "../gameSession";
import { batchStation, disposeBatches, loadStationKit, type StationKit } from "./stationAssets";
import { devicePosition, deviceYaw, stationPlacements } from "./stationLayout";
import { StationFallback } from "./StationFallback";
import { StationDescents } from "./StationDescents";
import { CommercialFeatures } from "./CommercialFeatures";

function KitSign({ kit, text, position, width = 4, yaw = -Math.PI / 2 }: { kit: StationKit; text: string; position: [number, number, number]; width?: number; yaw?: number }) {
  const model = useMemo(() => kit.models.get("sign-panel")!.clone(true), [kit]);
  const texture = useMemo(() => createSignTexture(text, width), [text, width]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position} rotation={[0, yaw, 0]} scale={[width / 2.8, 1, 1]}>
    <primitive object={model} dispose={null} />
    <mesh position={[0, 0.25, 0.067]}><planeGeometry args={[SIGN_FACE.width, SIGN_FACE.height]} /><meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} /></mesh>
  </group>;
}

function FloorReflections({ enabled }: { enabled: boolean }) {
  const scene = useThree((state) => state.scene), invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!enabled) return;
    const group = new Group(); group.name = "station-floor-reflections";
    const mirrors = [
      createFloorReflection(STAIRS_TOP.x, HEIGHT, STAIRS_TOP.x / 2, HEIGHT / 2),
      createFloorReflection(WIDTH - STAIRS_BOTTOM.x, HEIGHT, (WIDTH + STAIRS_BOTTOM.x) / 2, HEIGHT / 2, -2),
    ];
    group.add(...mirrors); scene.add(group); invalidate();
    return () => { scene.remove(group); mirrors.forEach(disposeFloorReflection); invalidate(); };
  }, [enabled, scene, invalidate]);
  return null;
}

function ImportedStation({ kit, session, overview, standard, reducedMotion }: { kit: StationKit; session: GameSession; overview: boolean; standard: boolean; reducedMotion: boolean }) {
  const { gl, camera, scene } = useThree();
  const gpu = useMemo(() => {
    const context = gl.getContext(), extension = context.getExtension("WEBGL_debug_renderer_info");
    return String(context.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : context.RENDERER));
  }, [gl]);
  const staticGroup = useMemo(() => batchStation(kit, stationPlacements().filter((p) => !overview || !p.upper)), [kit, overview]);
  const devices = useMemo(() => FACILITIES.map((def) => {
    const id = def.kind === "tvm" ? "ticket-machine" : def.kind === "security" ? "security-arch" : "fare-gate";
    const model = kit.models.get(id)!.clone(true); model.name = def.id;
    model.position.set(...devicePosition(def.kind, def.pos.x, def.pos.y, def.queueDirection)); model.rotation.y = deviceYaw(def.kind, def.queueDirection);
    model.userData.facilityId = def.id; model.userData.kind = def.kind; return model;
  }), [kit]);
  const statusMaterials = useMemo(() => makeMaterials(), []);
  useEffect(() => () => disposeBatches(staticGroup), [staticGroup]);
  useEffect(() => () => { Object.values(statusMaterials).forEach((mat) => mat.dispose()); }, [statusMaterials]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("debug") !== "1") return;
    const inspect = () => ({
      loaded: true, overview, ceiling: STATION_CEILING, reflectionCount: scene.getObjectByName("station-floor-reflections")?.children.length ?? 0,
      stairs: scene.getObjectByName("station-stairs")?.userData, escalator: scene.getObjectByName("station-escalator")?.userData,
      ...staticGroup.userData, gpuGeometries: gl.info.memory.geometries, gpuTextures: gl.info.memory.textures,
      drawCalls: gl.info.render.calls, renderedFrames: gl.info.render.frame, triangles: gl.info.render.triangles, camera: camera.position.toArray(),
      shadows: gl.shadowMap.enabled, dpr: gl.getPixelRatio(), gpu,
      t: session.engine.t, phase: session.runner?.phase, player: { position: { ...session.engine.player.pos }, activity: session.engine.player.activity.kind, screened: session.engine.player.screened, passedGate: session.engine.player.passedGate, onPlatform: session.engine.player.onPlatform },
      devices: devices.map((root) => {
        const hinges: number[] = []; root.traverse((node) => { if (node.userData.role === "gateHinge") hinges.push(node.rotation.y); });
        return { id: root.name, state: root.userData.state, position: root.position.toArray(), yaw: root.rotation.y, opening: root.userData.opening ?? 0, hinges };
      }),
    });
    const target = window as typeof window & { stationSceneInspect?: typeof inspect }; target.stationSceneInspect = inspect;
    return () => { if (target.stationSceneInspect === inspect) delete target.stationSceneInspect; };
  }, [camera, devices, gl, gpu, overview, scene, session, staticGroup]);
  useFrame((_, delta) => {
    for (const root of devices) {
      const frame = session.presentation.current.facilities.find((f) => f.id === root.name);
      if (frame && root.userData.state !== frame.status) setFacilityState(root, frame.status, statusMaterials);
      if (root.userData.kind === "gate") {
        const target = frame?.serving && frame.status === "open" ? 1 : 0;
        const old = Number(root.userData.opening ?? 0);
        const eased = old + (target - old) * Math.min(1, delta * 12 * session.speed);
        const next = session.frozen ? old : reducedMotion || Math.abs(target - eased) < 0.001 ? target : eased;
        root.userData.opening = next; setGateProgress(root, next);
      }
    }
  });
  const steel = kit.materials.get("kit.metal.satin")!, ink = kit.materials.get("kit.coating.charcoal")!;
  return <group name="station-kit-game">
    <FloorReflections enabled={standard && !overview} />
    <primitive object={staticGroup} dispose={null} />
    {devices.map((root: Group) => <primitive key={root.name} object={root} dispose={null} />)}
    {FACILITIES.filter((f) => f.kind === "security").map((def) => <group key={`belt-${def.id}`} position={[def.pos.x + CONVEYOR.x + CONVEYOR.w / 2, 0, def.pos.y + CONVEYOR.y + CONVEYOR.h / 2]}>
      <mesh material={steel} position={[0, 0.43, 0]} castShadow><boxGeometry args={[CONVEYOR.w, 0.14, CONVEYOR.h]} /></mesh>
      <mesh material={ink} position={[0, 0.508, 0]} receiveShadow><boxGeometry args={[CONVEYOR.w - 0.1, 0.016, CONVEYOR.h - 0.06]} /></mesh>
      {[-0.45, 0.45].map((x) => <mesh key={x} material={steel} position={[x, 0.2, 0]} castShadow><boxGeometry args={[0.07, 0.4, 0.3]} /></mesh>)}
    </group>)}
    <StationDescents material={kit.materials.get("kit.terrazzo.sage")!} session={session} reducedMotion={reducedMotion} />
    <CommercialFeatures />
    <KitSign kit={kit} text="01  购票 / TICKETS →" position={[10.8, 2.8, 15]} width={5.2} />
    <KitSign kit={kit} text="02  安全检查 →" position={[24, 2.8, 15]} width={4.5} />
    <KitSign kit={kit} text="03  检票进站 →" position={[42, 2.8, 15]} width={4.5} />
    <KitSign kit={kit} text="04  北楼梯 / 南扶梯 →" position={[54, 2.8, 15]} width={5.8} />
    <KitSign kit={kit} text="下一程，由你决定" position={[WIDTH - 3, 0.8, 15]} width={5} />
    {FACILITIES.map((def) => <KitSign key={def.id} kit={kit} text={def.id} position={[def.kind === "tvm" ? def.pos.x : def.pos.x - 0.12, def.kind === "security" ? 2.6 : 2.0, def.pos.y + (def.kind === "tvm" ? 0.32 : 0)]} yaw={deviceYaw(def.kind, def.queueDirection)} width={1.1} />)}
  </group>;
}

export const Station = memo(function Station({ session, overview, standard, reducedMotion = false, onAssetError }: { session: GameSession; overview: boolean; standard: boolean; reducedMotion?: boolean; onAssetError: (message: string) => void }) {
  const [kit, setKit] = useState<StationKit | null>(null);
  useEffect(() => {
    let active = true;
    loadStationKit().then((loaded) => { if (active) setKit(loaded); }).catch((error: unknown) => {
      if (active) onAssetError(`站厅素材加载失败，已使用几何场景，可重试三维素材：${error instanceof Error ? error.message : "资源请求失败"}`);
    });
    return () => { active = false; };
  }, [onAssetError]);
  return kit ? <ImportedStation kit={kit} session={session} overview={overview} standard={standard} reducedMotion={reducedMotion} /> : <StationFallback session={session} reducedMotion={reducedMotion} />;
});
