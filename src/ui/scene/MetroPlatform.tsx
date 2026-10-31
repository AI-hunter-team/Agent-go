import { memo, useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Group, Mesh, Vector3 } from "three";
import { HEIGHT, WIDTH } from "../../sim/layout";
import { createMetroTrack, createParkedMetro, disposeMetroGeometry, disposeMetroTrack, metroPlatformLayout } from "./metroPlatformLayout";
import { loadMetroTrain } from "./metroTrainAssets";
import { Sign } from "./Sign";

/** Parked metro scenery is independent of the simulation and the station-kit load. */
export const MetroPlatform = memo(function MetroPlatform({ overview, standard, onAssetError }: {
  overview: boolean; standard: boolean; onAssetError: (message: string) => void;
}) {
  const [source, setSource] = useState<Group | null>(null), { invalidate, get } = useThree();
  const layout = useMemo(() => metroPlatformLayout(WIDTH, HEIGHT), []);
  const structure = useMemo(() => createMetroTrack(layout), [layout]);
  const train = useMemo(() => source ? createParkedMetro(source, layout.platformSide) : null, [source, layout]);
  useEffect(() => () => disposeMetroTrack(structure), [structure]);
  useEffect(() => () => { if (train) disposeMetroGeometry(train); }, [train]);
  useEffect(() => {
    let active = true;
    const url = new URL(`${import.meta.env.BASE_URL}assets/metro-train/metro-head-car.glb`, location.origin).href;
    loadMetroTrain(url).then((model) => { if (active) { setSource(model); invalidate(); } }).catch((error: unknown) => {
      if (active) onAssetError(`站台列车加载失败，可重试三维素材：${error instanceof Error ? error.message : "资源请求失败"}`);
    });
    return () => { active = false; };
  }, [invalidate, onAssetError]);
  useEffect(() => {
    const canopy = structure.getObjectByName("metro-track-canopy"); if (canopy) canopy.visible = !overview;
    train?.traverse((node) => { if (node instanceof Mesh) node.castShadow = standard && !Array.isArray(node.material) && !node.material.transparent; });
    invalidate();
  }, [overview, standard, train, structure, invalidate]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("debug") !== "1") return;
    const inspect = () => {
      const { scene, camera, gl } = get(), instance = scene.getObjectByName("metro-train-placement");
      instance?.updateWorldMatrix(true, true);
      const bounds = instance ? new Box3().setFromObject(instance) : null;
      const centre = bounds?.getCenter(new Vector3()), screen = centre?.clone().project(camera);
      const geometryIds: string[] = []; structure.traverse((node) => { if (node instanceof Mesh) geometryIds.push(node.geometry.uuid); });
      train?.traverse((node) => { if (node instanceof Mesh) geometryIds.push(node.geometry.uuid); });
      return { loaded: !!train, ...layout, doorStates: train?.userData.doors ?? [], staticDraws: train?.children.length ?? 0,
        geometryIds,
        trainBounds: bounds ? { min: bounds.min.toArray(), max: bounds.max.toArray() } : null,
        screen: screen?.toArray(), camera: camera.position.toArray(), canopyVisible: structure.getObjectByName("metro-track-canopy")?.visible,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, drawCalls: gl.info.render.calls };
    };
    const target = window as typeof window & { metroSceneInspect?: typeof inspect }; target.metroSceneInspect = inspect;
    return () => { if (target.metroSceneInspect === inspect) delete target.metroSceneInspect; };
  }, [get, layout, structure, train]);
  return <group name="metro-platform">
    <primitive object={structure} dispose={null} />
    {train && <group name="metro-train-placement" position={[layout.trackX, layout.railY, layout.centreZ]} rotation={[0, layout.trainYaw, 0]}><primitive object={train} dispose={null} /></group>}
    <Sign text="01  青绿线 · 列车停靠" position={[WIDTH + 0.09, -0.1, 15]} width={4.6} />
  </group>;
});
