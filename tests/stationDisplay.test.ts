import { describe, expect, test, vi } from "vitest";
import { Box3, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, type ShaderMaterial, type WebGLRenderer } from "three";
import { createAsset, makeMaterials } from "../src/assets/station-kit/index";
import { BASE_WALL_HEIGHT, FASCIA_HEIGHT, FRAME_HEIGHT, STATION_CEILING } from "../src/assets/station-kit/dimensions";
import { paintSign, SIGN_FACE, signCanvasSize } from "../src/assets/station-kit/signs";
import { createFloorReflection, disposeFloorReflection } from "../src/assets/station-kit/reflection";
import { devicePosition, deviceYaw, stationPlacements } from "../src/ui/scene/stationLayout";
import { cameraFraction } from "../src/ui/scene/cameraCollision";

import { FACILITIES, STAIRS_TOP, STAIRS_BOTTOM, WIDTH } from "../src/sim/layout";
import { TVM_MODEL_OFFSET_X } from "../src/sim/facilityGeometry";

const materials = makeMaterials();

describe("station display regressions", () => {
  test.each(["open", "closed", "broken"] as const)("security %s has no overlapping header/post exterior faces", (state) => {
    const root = createAsset("security-arch", materials, state);
    const header = new Box3().setFromObject(root.getObjectByName("scanner_header")!);
    root.children.filter((node) => node.name === "scanner_post").forEach((post) => {
      const bounds = new Box3().setFromObject(post);
      expect(bounds.max.y).toBeCloseTo(header.min.y, 6);
      expect(header.clone().intersect(bounds).getSize(new Vector3()).y).toBeLessThan(1e-6);
    });
    const bounds = new Box3().setFromObject(root);
    expect(bounds.max.y).toBeCloseTo(2.5, 6);
    expect(root.getObjectByName("anchor_entry")!.position.toArray()).toEqual([0, 0, 0.6]);
    expect(root.getObjectByName("anchor_exit")!.position.toArray()).toEqual([0, 0, -1.4]);
  });

  test.each([1.1, 2.8, 4.5, 5.2, 8.8])("%sm signs retain square pixels in world space", (width) => {
    const canvas = signCanvasSize(width);
    const surfaceAspect = width * SIGN_FACE.width / SIGN_FACE.panelWidth / SIGN_FACE.height;
    expect(Math.abs(canvas.width / canvas.height / surfaceAspect - 1)).toBeLessThan(0.002);
  });

  test("long bilingual signs fit by reducing font size without maxWidth distortion", () => {
    const context = {
      font: "", fillStyle: "", textAlign: "center" as CanvasTextAlign, textBaseline: "middle" as CanvasTextBaseline,
      fillRect: vi.fn(), fillText: vi.fn(),
      measureText(text: string) { return { width: parseFloat(this.font.split(" ")[1]) * text.length } as TextMetrics; },
    };
    const text = "01  购票 / TICKETS →";
    paintSign(context, text, 400, 160);
    expect(context.measureText(text).width).toBeLessThanOrEqual(400 - 160 * 0.36 + 1e-6);
    expect(parseFloat(context.font.split(" ")[1])).toBeLessThan(160 * 0.64);
    expect(context.fillText).toHaveBeenCalledWith(text, 200, 80);
    paintSign(context, "S1", 400, 160);
    expect(parseFloat(context.font.split(" ")[1])).toBe(160 * 0.64);
  });

  test("both levels use sage floors, with a clear stair opening and continuous 6m roof", () => {
    const placements = stationPlacements(), floors = placements.filter((p) => p.id.startsWith("floor-"));
    expect(new Set(floors.map((p) => p.id))).toEqual(new Set(["floor-sage"]));
    expect(new Set(floors.map((p) => p.position[1]))).toEqual(new Set([0, -2]));
    expect(floors.every((p) => p.position[0] < STAIRS_TOP.x || p.position[0] > STAIRS_BOTTOM.x)).toBe(true);
    expect(placements.filter((p) => p.id === "ceiling-panel").every((p) => p.position[1] === 6 && p.upper)).toBe(true);
    expect(BASE_WALL_HEIGHT + FASCIA_HEIGHT).toBe(STATION_CEILING);
    expect(new Box3().setFromObject(createAsset("pillar", materials)).max.y).toBeCloseTo(FRAME_HEIGHT, 5);
    expect(new Box3().setFromObject(createAsset("structural-frame", materials)).max.y).toBeCloseTo(FRAME_HEIGHT + 0.01, 5);
    const portal = createAsset("portal", materials);
    expect(new Box3().setFromObject(portal).max.y).toBeCloseTo(STATION_CEILING, 5);
    expect(new Box3().setFromObject(portal.getObjectByName("lintel")!).min.y).toBeCloseTo(5.25, 5);
  });

  test("camera can use the newly raised space and still clips the roof, walls and tall pillars", () => {
    expect(cameraFraction({ x: 10, y: 1.5, z: 15 }, { x: 10, y: 5.5, z: 15 })).toBe(1);
    expect(cameraFraction({ x: 10, y: 1.5, z: 15 }, { x: 10, y: 8, z: 15 })).toBeLessThan(0.7);
    expect(cameraFraction({ x: 65, y: 5, z: 29 }, { x: 65, y: 5, z: 33 })).toBeLessThan(0.3);
    expect(cameraFraction({ x: 34, y: 5, z: 12 }, { x: 40, y: 5, z: 12 })).toBeLessThan(0.2);
  });

  test("upper/lower reflection passes hide every mirror and dispose their render targets", () => {
    const scene = new Scene(), camera = new PerspectiveCamera(); camera.position.set(10, 2, 15); camera.updateMatrixWorld();
    const upper = createFloorReflection(48, 30, 24, 15), lower = createFloorReflection(13, 30, 63.5, 15, -2);
    scene.add(upper, lower); scene.updateMatrixWorld(true);
    const render = vi.fn(() => { expect(upper.visible).toBe(false); expect(lower.visible).toBe(false); });
    const renderer = {
      getRenderTarget: () => null, setRenderTarget: vi.fn(), xr: { enabled: false }, shadowMap: { autoUpdate: true },
      state: { buffers: { depth: { setMask: vi.fn() } }, viewport: vi.fn() }, autoClear: true, render,
    } as unknown as WebGLRenderer;
    upper.onBeforeRender(renderer, scene, camera, upper.geometry, upper.material as ShaderMaterial, null as never);
    expect(render).toHaveBeenCalledTimes(1); expect(upper.visible).toBe(true); expect(lower.visible).toBe(true);
    expect(upper.position.y).toBeCloseTo(0.004); expect(lower.position.y).toBeCloseTo(-1.996);
    scene.overrideMaterial = new MeshBasicMaterial();
    upper.onBeforeRender(renderer, scene, camera, upper.geometry, upper.material as ShaderMaterial, null as never);
    expect(render).toHaveBeenCalledTimes(1); scene.overrideMaterial.dispose();
    for (const mirror of [upper, lower]) {
      const disposed = vi.fn(); mirror.getRenderTarget().addEventListener("dispose", disposed);
      disposeFloorReflection(mirror); expect(disposed).toHaveBeenCalledTimes(1);
    }
  });
});


test("south-facing ticket machines align their screens and queue ticks with the new service heads", () => {
  const placements = stationPlacements();
  for (const def of FACILITIES.filter((f) => f.kind === "tvm")) {
    const root = createAsset("ticket-machine", materials);
    root.position.set(...devicePosition(def.kind, def.pos.x, def.pos.y, def.queueDirection));
    root.rotation.y = deviceYaw(def.kind, def.queueDirection); root.updateMatrixWorld(true);
    const screen = root.getObjectByName("screen")!.getWorldPosition(new Vector3());
    expect(root.position.toArray()).toEqual([def.pos.x, 0, def.pos.y - TVM_MODEL_OFFSET_X]);
    expect(screen.z).toBeGreaterThan(root.position.z);
    const marking = placements.find((p) => p.id === "marking-queue" && p.position[0] === def.head.x && p.position[2] === def.head.y)!;
    const ticks = createAsset(marking.id, materials);
    ticks.position.set(...marking.position); ticks.rotation.y = marking.yaw; ticks.updateMatrixWorld(true);
    const positions = ticks.children.map((node) => node.getWorldPosition(new Vector3()));
    expect(positions.every((pos) => Math.abs(pos.x - def.pos.x) < 1e-6)).toBe(true);
    expect(positions.map((pos) => pos.z)).toEqual(Array.from({ length: 6 }, (_, i) => expect.closeTo(def.head.y + i * 0.8, 6)));
  }
  const floors = placements.filter((p) => p.id === "floor-sage");
  expect(Math.max(...floors.map((p) => p.position[0] + p.scale[0] * 1.5))).toBe(WIDTH);
});
