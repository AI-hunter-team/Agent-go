import { describe, expect, test } from "vitest";
import { Box3, Group, Mesh, Vector3 } from "three";
import { ASSETS, createAsset, makeMaterials, setFacilityState, setGateProgress } from "../src/assets/station-kit/index";
import { fitRailingSpan } from "../src/assets/station-kit/railing";
import { FACILITIES, SECURITY_BARRIERS, STAIRS_BOTTOM, STAIRS_TOP, WIDTH } from "../src/sim/layout";
import { GATE_CLEAR_WIDTH, facilitySolids } from "../src/sim/facilityGeometry";
import { clearOfScenery, clearServiceExit, personRadius } from "../src/sim/movement";
import { segmentIntersectsRect } from "../src/sim/geometry";
import { batchStation, disposeBatches } from "../src/ui/scene/stationAssets";
import { devicePosition, stationPlacements } from "../src/ui/scene/stationLayout";

const materials = makeMaterials();
const size = (root: Group) => new Box3().setFromObject(root).getSize(new Vector3());
describe("station railings", () => {
  test("all three modules have the agreed physical envelope", () => {
    expect(ASSETS).toHaveLength(27);
    for (const [id, expected] of [["railing-straight", [3, 1.1, 0.16]], ["railing-corner", [1.5, 1.1, 1.5]], ["railing-end", [0.16, 1.1, 0.16]]] as const) {
      size(createAsset(id, materials)).toArray().forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));
    }
  });
  test.each([0.32, 1.1, 3.8, 9.6, 13])("fitted %sm spans keep post thickness, end points and rod spacing", (length) => {
    const root = fitRailingSpan(createAsset("railing-straight", materials), length);
    expect(size(root).x).toBeCloseTo(length, 5); expect(size(root).y).toBeCloseTo(1.1, 5);
    const posts = root.children.filter((c) => c.name === "railing_post") as Group[];
    expect(posts).toHaveLength(2);
    posts.forEach((p) => expect(size(p).x).toBeCloseTo(0.16, 5));
    const xs = root.children.filter((c) => c.name === "railing_post" || c.name === "railing_baluster").map((c) => c.position.x).sort((a, b) => a - b);
    xs.slice(1).forEach((x, i) => expect(x - xs[i]).toBeLessThanOrEqual(0.140001));
    expect(root.getObjectByName("anchor_start")!.position.x).toBe(-length / 2 + 0.08);
    expect(root.getObjectByName("anchor_end")!.position.x).toBe(length / 2 - 0.08);
  });
  test("shared posts may be omitted without resizing remaining posts", () => {
    const root = fitRailingSpan(createAsset("railing-straight", materials), 3, false);
    expect(root.children.filter((c) => c.name === "railing_post")).toHaveLength(1);
  });
  test("corner connection anchors identify the two external post centres", () => {
    const root = createAsset("railing-corner", materials); root.updateMatrixWorld(true);
    const start = root.getObjectByName("anchor_start")!.getWorldPosition(new Vector3());
    const end = root.getObjectByName("anchor_end")!.getWorldPosition(new Vector3());
    expect(start.x).toBeCloseTo(0.67); expect(start.z).toBeCloseTo(-0.67);
    expect(end.x).toBeCloseTo(-0.67); expect(end.z).toBeCloseTo(0.67);
  });
  test("connecting at exported anchors leaves no gap in the handrail and shares exactly one post", () => {
    const prototype = createAsset("railing-straight", materials);
    const a = fitRailingSpan(prototype, 3), b = fitRailingSpan(prototype, 2.1, false);
    b.position.x = a.getObjectByName("anchor_end")!.position.x - b.getObjectByName("anchor_start")!.position.x;
    const handA = a.getObjectByName("railing_handrail")!, handB = b.getObjectByName("railing_handrail")!;
    expect(handA.scale.x / 2).toBeCloseTo(b.position.x - handB.scale.x / 2, 6);
    expect([...a.children, ...b.children].filter((node) => node.name === "railing_post")).toHaveLength(3);
  });
});
describe("station integration contracts", () => {
  test("south-facing ticket machine model bounds agree with the simulator collision footprint", () => {
    for (const def of FACILITIES.filter(f => f.kind === "tvm")) {
      const model = createAsset("ticket-machine", materials);
      model.position.set(...devicePosition(def.kind, def.pos.x, def.pos.y));
      const bounds = new Box3().setFromObject(model), [solid] = facilitySolids(def.kind, def.pos);
      expect(bounds.min.x).toBeCloseTo(solid.x, 5); expect(bounds.max.x).toBeCloseTo(solid.x + solid.w, 5);
      expect(bounds.min.z).toBeCloseTo(solid.y, 5); expect(bounds.max.z).toBeCloseTo(solid.y + solid.h, 5);
    }
  });
  test("normal and luggage passengers fit every service exit while ordinary walking cannot cross railings", () => {
    expect(GATE_CLEAR_WIDTH).toBeGreaterThan(personRadius("luggage") * 2 + 0.04);
    for (const def of FACILITIES) for (const kind of ["normal", "luggage"] as const) {
      if (def.exit) expect(clearServiceExit(def.head, def.exit, personRadius(kind)), `${def.id}/${kind}`).toBe(true);
      else expect(facilitySolids(def.kind, def.pos).every((r) => !segmentIntersectsRect(def.head, def.head, { x: r.x - personRadius(kind), y: r.y - personRadius(kind), w: r.w + personRadius(kind) * 2, h: r.h + personRadius(kind) * 2 }))).toBe(true);
    }
    const r = SECURITY_BARRIERS[1], z = r.y + r.h / 2;
    expect(clearOfScenery({ x: 24, y: z }, { x: 28, y: z }, 0.32)).toBe(false);
  });
  test("separate clones do not share hinge or facility status state", () => {
    const prototype = createAsset("fare-gate", materials), a = prototype.clone(true), b = prototype.clone(true);
    setFacilityState(a, "broken", materials); setGateProgress(a, 1);
    expect(a.userData.state).toBe("broken"); expect(b.userData.state).toBe("open");
    expect(a.getObjectByName("flap_left")!.rotation.y).not.toBe(b.getObjectByName("flap_left")!.rotation.y);
    expect((a.getObjectByName("status_indicator") as Mesh).material).not.toBe((b.getObjectByName("status_indicator") as Mesh).material);
  });
  test("floor batches preserve level boundaries and materially reduce draw calls", () => {
    const models = new Map(ASSETS.map((a) => [a.id, createAsset(a.id, materials)]));
    const placements = stationPlacements(), floors = placements.filter((p) => p.id.startsWith("floor-"));
    const group = batchStation({ models, materials: new Map() }, floors);
    expect(group.children.length).toBeLessThan(floors.length / 3);
    const bounds = new Box3().setFromObject(group);
    expect(bounds.min.x).toBeCloseTo(0, 5); expect(bounds.max.x).toBeCloseTo(WIDTH, 5);
    expect(bounds.min.y).toBeCloseTo(-2.12, 3);
    expect(floors.every((p) => p.position[0] < STAIRS_TOP.x || p.position[0] > STAIRS_BOTTOM.x)).toBe(true);
    disposeBatches(group);
  });
});
