import { expect, test, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import { createStationStairs, disposeStationStairs, STAIR_DETAILS } from "../src/ui/scene/staircase";
import { makeMaterials } from "../src/assets/station-kit/index";
import { STAIRS_BOTTOM, STAIRS_TOP } from "../src/sim/layout";

const stone = makeMaterials().sage;
const downward = (root: ReturnType<typeof createStationStairs>, x: number, z = 15) => new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0)).intersectObject(root, true)[0];

test("20 shallow steps fit the unchanged 9m run and 2m drop, using the sage material", () => {
  const stairs = createStationStairs(stone);
  expect(stairs.userData).toMatchObject({ count: 20, going: 0.45, rise: 0.1, width: 4, drop: 2, upper: [48, 0, 15], lower: [57, -2, 15] });
  expect(STAIRS_TOP).toEqual({ x: 48, y: 15 }); expect(STAIRS_BOTTOM).toEqual({ x: 57, y: 15 });
  expect((stairs.getObjectByName("stairs_stone") as Mesh).material).toBe(stone);
  for (let i = 0; i < 20; i++) expect(downward(stairs, 48 + i * 0.45 + 0.15).point.y).toBeCloseTo(-(i + 1) * 0.1, 5);
  expect(stairs.children).toHaveLength(2); // Static detail is batched, not one draw per groove.
  disposeStationStairs(stairs);
});

test("two charcoal grooves per tread are recessed 3mm and stop before the side borders", () => {
  const stairs = createStationStairs(stone);
  for (let i = 0; i < 20; i++) for (const offset of STAIR_DETAILS.grooveOffsets) {
    const x = 48 + (i + 1) * 0.45 - offset + STAIR_DETAILS.grooveWidth / 2;
    const hit = downward(stairs, x);
    expect(hit.object.name).toBe("stairs_anti_slip");
    expect(hit.point.y).toBeCloseTo(-(i + 1) * 0.1 - 0.003, 5);
    expect(downward(stairs, x, 13.04).object.name).toBe("stairs_stone");
  }
  expect(stairs.userData.grooveCount).toBe(40);
  disposeStationStairs(stairs);
});

test("stairs have closed sides and underside, with flush landing caps at both levels", () => {
  const stairs = createStationStairs(stone);
  const side = new Raycaster(new Vector3(52.6, -1.8, 11), new Vector3(0, 0, 1)).intersectObject(stairs, true)[0];
  const bottom = new Raycaster(new Vector3(52.6, -4, 15), new Vector3(0, 1, 0)).intersectObject(stairs, true)[0];
  expect(side.object.name).toBe("stairs_stone"); expect(side.point.z).toBeCloseTo(13, 5);
  expect(bottom.point.y).toBeCloseTo(-2.12, 5);
  expect(downward(stairs, 47.98).point.y).toBeCloseTo(0.003, 5);
  expect(downward(stairs, 57.02).point.y).toBeCloseTo(-1.997, 5);
  disposeStationStairs(stairs);
});

test("disposing staircase resources keeps the shared station material alive", () => {
  const stairs = createStationStairs(stone), stoneDisposed = vi.fn(), grooveDisposed = vi.fn();
  stone.addEventListener("dispose", stoneDisposed);
  const groove = stairs.getObjectByName("stairs_anti_slip") as Mesh;
  (groove.material as MeshStandardMaterial).addEventListener("dispose", grooveDisposed);
  disposeStationStairs(stairs);
  expect(stoneDisposed).not.toHaveBeenCalled(); expect(grooveDisposed).toHaveBeenCalledOnce();
  stone.removeEventListener("dispose", stoneDisposed);
});
