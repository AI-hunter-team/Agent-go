import { expect, test } from "vitest";
import { Raycaster, Vector3 } from "three";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createControlRoomAsset, disposeControlAsset } from "../src/ui/scene/controlRoomModels";
import { createEntrancePassage } from "../src/ui/scene/generatedArchitecture";
import { disposeSurfaceGeometry } from "../src/ui/scene/surfaceGeometry";
import { generateWorld, publicMap } from "../src/sim/worldDefinition";
import { Engine } from "../src/sim/engine";
import { stationSwitch } from "../src/sim/stationSwitch";
import { BLACKOUT_SWITCH_REACH } from "../src/sim/layout";
import { entrancePoint } from "../src/sim/entranceGeometry";
import { FollowCamera } from "../src/ui/scene/followCamera";
import { emptyScenario } from "./fixtures/scenarios";

const station = (seed: number) => generateWorld(seed, { generatorVersion: "metro-v3" });

test.each([1, 2, 4])("V3 seed %i follows both elevated entrances above the passage floor", seed => {
  const d = station(seed);
  for (const entry of d.entrances!) for (const progress of [0, .2, .5, .8]) {
    const point = entrancePoint(entry, progress), camera = new FollowCamera();
    const pose = { x: point.x, y: point.elevation!, z: point.y, yaw: Math.atan2(entry.inward.x, entry.inward.y) };
    camera.update(pose, { yaw: 0, pitch: .16, distance: 4.2 }, 1 / 60, true, false, d);
    const along = (camera.position.x - entry.top.x) * entry.inward.x + (camera.position.z - entry.top.y) * entry.inward.y;
    const floor = along < 0 ? 4 : along > 6 ? 0 : 4 * (1 - along / 6);
    expect(camera.position.y, `${entry.id} progress ${progress}`).toBeGreaterThan(floor + .2);
  }
});

test("V3 public switch targets fit the footprint and can be approached and operated", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const d = station(seed), e = new Engine(seed, {}, emptyScenario(seed), undefined, d), target = stationSwitch(d);
    expect(publicMap(d).nodes.find(n => n.id === "BLACKOUT_SWITCH")?.pos).toEqual(target.approach);
    expect(e.world.navigation.findPath(e.player.pos, target.approach, .48), `seed ${seed}`).not.toBeNull();
    expect(Math.hypot(target.position.x - target.approach.x, target.position.y - target.approach.y)).toBeLessThanOrEqual(BLACKOUT_SWITCH_REACH);
    expect(e.applyAction({ type: "move_to", target: "BLACKOUT_SWITCH", reason: "" }).ok).toBe(true);
    for (let i = 0; i < 150 && e.player.activity.kind === "walking"; i++) e.step();
    expect(e.applyAction({ type: "operate_switch", reason: "" }).ok).toBe(true);
  }
}, 15000);


test("the rendered lounge junction leaves the timed follow view and untimed side entry open", () => {
  const palette = createGeneratedPalette();
  const passage = createControlRoomAsset("passage", palette);
  const landing = createEntrancePassage(station(1).entrances![0], palette, false, true);
  const clear = (root: typeof passage, from: Vector3, to: Vector3) => {
    root.updateMatrixWorld(true);
    const ray = new Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to));
    expect(ray.intersectObject(root, true)).toHaveLength(0);
  };
  try {
    clear(passage, new Vector3(0, 2.35, 4.2), new Vector3(0, 1.25, 0));
    clear(landing, new Vector3(-2.1, 5, -2), new Vector3(-3.5, 5, 0));
  } finally {
    disposeControlAsset(passage); disposeSurfaceGeometry(landing); palette.dispose();
  }
});
