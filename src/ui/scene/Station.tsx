import { memo, useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group } from "three";
import { makeMaterials, setFacilityState, setGateProgress } from "../../assets/station-kit/index";
import { FACILITIES } from "../../sim/layout";
import { CONVEYOR } from "../../sim/facilityGeometry";
import type { GameSession } from "../gameSession";
import { batchStation, disposeBatches, loadStationKit, type StationKit } from "./stationAssets";
import { devicePosition, stationPlacements } from "./stationLayout";
import { StationFallback } from "./StationFallback";

function KitSign({ kit, text, position, width = 4 }: { kit: StationKit; text: string; position: [number, number, number]; width?: number }) {
  const model = useMemo(() => kit.models.get("sign-panel")!.clone(true), [kit]);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 160;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#353b38"; ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = "#f8f5eb"; ctx.font = '500 66px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 80, 980);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position} rotation={[0, -Math.PI / 2, 0]} scale={[width / 2.8, 1, 1]}>
    <primitive object={model} dispose={null} />
    <mesh position={[0, 0.25, 0.067]}><planeGeometry args={[2.65, 0.42]} /><meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} /></mesh>
  </group>;
}

function ImportedStation({ kit, session, overview }: { kit: StationKit; session: GameSession; overview: boolean }) {
  const { gl, camera } = useThree();
  const gpu = useMemo(() => {
    const context = gl.getContext(), extension = context.getExtension("WEBGL_debug_renderer_info");
    return String(context.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : context.RENDERER));
  }, [gl]);
  const staticGroup = useMemo(() => batchStation(kit, stationPlacements().filter((p) => !overview || !p.upper)), [kit, overview]);
  const devices = useMemo(() => FACILITIES.map((def) => {
    const id = def.kind === "tvm" ? "ticket-machine" : def.kind === "security" ? "security-arch" : "fare-gate";
    const model = kit.models.get(id)!.clone(true); model.name = def.id;
    model.position.set(...devicePosition(def.kind, def.pos.x, def.pos.y)); model.rotation.y = -Math.PI / 2;
    model.userData.facilityId = def.id; model.userData.kind = def.kind; return model;
  }), [kit]);
  const statusMaterials = useMemo(() => makeMaterials(), []);
  useEffect(() => () => disposeBatches(staticGroup), [staticGroup]);
  useEffect(() => () => { Object.values(statusMaterials).forEach((mat) => mat.dispose()); }, [statusMaterials]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("debug") !== "1") return;
    const inspect = () => ({
      loaded: true, overview, ...staticGroup.userData, gpuGeometries: gl.info.memory.geometries, gpuTextures: gl.info.memory.textures,
      drawCalls: gl.info.render.calls, renderedFrames: gl.info.render.frame, triangles: gl.info.render.triangles, camera: camera.position.toArray(),
      shadows: gl.shadowMap.enabled, dpr: gl.getPixelRatio(), gpu,
      t: session.engine.t, phase: session.runner?.phase, player: { position: { ...session.engine.player.pos }, activity: session.engine.player.activity.kind, screened: session.engine.player.screened, passedGate: session.engine.player.passedGate, onPlatform: session.engine.player.onPlatform },
      devices: devices.map((root) => {
        const hinges: number[] = []; root.traverse((node) => { if (node.userData.role === "gateHinge") hinges.push(node.rotation.y); });
        return { id: root.name, state: root.userData.state, opening: root.userData.opening ?? 0, hinges };
      }),
    });
    const target = window as typeof window & { stationSceneInspect?: typeof inspect }; target.stationSceneInspect = inspect;
    return () => { if (target.stationSceneInspect === inspect) delete target.stationSceneInspect; };
  }, [camera, devices, gl, gpu, overview, session, staticGroup]);
  useFrame((_, delta) => {
    for (const root of devices) {
      const frame = session.presentation.current.facilities.find((f) => f.id === root.name);
      if (frame && root.userData.state !== frame.status) setFacilityState(root, frame.status, statusMaterials);
      if (root.userData.kind === "gate") {
        const target = frame?.serving && frame.status === "open" ? 1 : 0;
        const old = Number(root.userData.opening ?? 0);
        const eased = old + (target - old) * Math.min(1, delta * 12 * session.speed);
        const next = session.frozen ? old : Math.abs(target - eased) < 0.001 ? target : eased;
        root.userData.opening = next; setGateProgress(root, next);
      }
    }
  });
  const steel = kit.materials.get("kit.metal.satin")!, ink = kit.materials.get("kit.coating.charcoal")!;
  return <group name="station-kit-game">
    <primitive object={staticGroup} dispose={null} />
    {devices.map((root: Group) => <primitive key={root.name} object={root} dispose={null} />)}
    {FACILITIES.filter((f) => f.kind === "security").map((def) => <group key={`belt-${def.id}`} position={[def.pos.x + CONVEYOR.x + CONVEYOR.w / 2, 0, def.pos.y + CONVEYOR.y + CONVEYOR.h / 2]}>
      <mesh material={steel} position={[0, 0.43, 0]} castShadow><boxGeometry args={[CONVEYOR.w, 0.14, CONVEYOR.h]} /></mesh>
      <mesh material={ink} position={[0, 0.508, 0]} receiveShadow><boxGeometry args={[CONVEYOR.w - 0.1, 0.016, CONVEYOR.h - 0.06]} /></mesh>
      {[-0.45, 0.45].map((x) => <mesh key={x} material={steel} position={[x, 0.2, 0]} castShadow><boxGeometry args={[0.07, 0.4, 0.3]} /></mesh>)}
    </group>)}
    {Array.from({ length: 12 }, (_, i) => {
      const x = 48 + (i + 0.5) * 0.75, top = -2 * (i + 1) / 12;
      return <mesh key={`step-${i}`} position={[x, top - 0.1, 15]} material={kit.materials.get("kit.terrazzo.ivory")} receiveShadow><boxGeometry args={[0.75, 0.2, 4]} /></mesh>;
    })}
    <KitSign kit={kit} text="01  购票 / TICKETS →" position={[10.8, 2.8, 15]} width={5.2} />
    <KitSign kit={kit} text="02  安全检查 →" position={[24, 2.8, 15]} width={4.5} />
    <KitSign kit={kit} text="03  检票进站 →" position={[42, 2.8, 15]} width={4.5} />
    <KitSign kit={kit} text="04  下楼到站台 ↓" position={[47.5, 2.8, 15]} width={4.8} />
    <KitSign kit={kit} text="下一程，由你决定" position={[66, 0.8, 15]} width={5} />
    {FACILITIES.map((def) => <KitSign key={def.id} kit={kit} text={def.id} position={[def.pos.x - 0.12, def.kind === "security" ? 2.6 : 2.0, def.pos.y]} width={1.1} />)}
  </group>;
}

export const Station = memo(function Station({ session, overview, onAssetError }: { session: GameSession; overview: boolean; onAssetError: (message: string) => void }) {
  const [kit, setKit] = useState<StationKit | null>(null);
  useEffect(() => {
    let active = true;
    loadStationKit().then((loaded) => { if (active) setKit(loaded); }).catch((error: unknown) => {
      if (active) onAssetError(`站厅素材加载失败，已使用几何场景，可重试三维素材：${error instanceof Error ? error.message : "资源请求失败"}`);
    });
    return () => { active = false; };
  }, [onAssetError]);
  return kit ? <ImportedStation kit={kit} session={session} overview={overview} /> : <StationFallback session={session} />;
});
