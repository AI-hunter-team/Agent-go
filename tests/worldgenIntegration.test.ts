import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { VictoryCamera } from "../src/ui/scene/victoryCamera";
import { Engine } from "../src/sim/engine";
import { World } from "../src/sim/world";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { classifyByKeywords } from "../src/sim/intent";
import { BLACKOUT_SWITCH_REACH } from "../src/sim/layout";
import { stationSwitch } from "../src/sim/stationSwitch";
import { generatedTrainDoors, generatedTrainLayout } from "../src/shared/generatedTrain";
import { METRO_PROFILE } from "../src/shared/metro";
import { generateWorld, publicMap } from "../src/sim/worldDefinition";

const emptyScenario = (seed: number) => ({ seed, spawns: [], events: [], initialStatus: {} });

describe("generated station and mainline integration", () => {
  it("places the switch at a reachable, publicly named approach across generated layouts", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const world = generateWorld(seed), station = stationSwitch(world);
      const engine = new Engine(seed, {}, emptyScenario(seed), undefined, world);
      expect(engine.world.navigation.findPath(world.layout.ENTRANCE, station.approach), `seed ${seed}`).not.toBeNull();
      expect(Math.hypot(station.position.x - station.approach.x, station.position.y - station.approach.y)).toBeLessThanOrEqual(BLACKOUT_SWITCH_REACH);
      expect(publicMap(world).nodes.find(node => node.id === "BLACKOUT_SWITCH")?.pos).toEqual(station.approach);
      expect(engine.applyAction({ type: "move_to", target: "BLACKOUT_SWITCH", reason: "前往电闸" }).ok).toBe(true);
    }
  });

  it.each([1, 2, 4, 19])("boards the generated train through an actual doorway (seed %i)", seed => {
    const definition = generateWorld(seed), doors = generatedTrainDoors(definition);
    const axis = definition.layout.platformAxis!, length = axis.direction === "x" ? definition.layout.WIDTH : definition.layout.HEIGHT;
    const train = generatedTrainLayout(length), floor = definition.layout.STAIRS_BOTTOM;
    expect(doors.length).toBe(train.count * 10);
    const samples = [doors[0], doors[Math.floor(doors.length / 2)], doors.at(-1)!];
    for (const door of samples) {
      const engine = new Engine(seed, {}, emptyScenario(seed), undefined, definition);
      Object.assign(engine.player, { pos: { ...floor }, passedGate: true, screened: true, onPlatform: true });
      expect(engine.status).toBe("running");
      expect(engine.world.navigation.findPath(floor, door.pos)).not.toBeNull();
      expect(publicMap(definition).nodes.some(node => node.id === door.id)).toBe(true);
      expect(engine.applyAction({ type: "move_to", target: door.id, reason: "前往车门" }).ok).toBe(true);
      for (let i = 0; i < 1000 && engine.status === "running"; i++) engine.step();
      expect(engine.status).toBe("success");
      expect(engine.player.onTrain).toBe(true);
      expect(engine.player.pos).toEqual(door.boardingPath.at(-1));
      const lateral = axis.direction === "x" ? engine.player.pos.y - axis.center : axis.center - engine.player.pos.x;
      expect(Math.abs(Math.abs(lateral) - train.trackCentre)).toBeLessThan(METRO_PROFILE.interiorHalfWidth);
    }
  });

  it.each([1, 2, 4])("keeps the victory camera inside the generated cabin (seed %i)", seed => {
    const definition = generateWorld(seed), axis = definition.layout.platformAxis!;
    const length = axis.direction === "x" ? definition.layout.WIDTH : definition.layout.HEIGHT;
    const train = generatedTrainLayout(length), doors = generatedTrainDoors(definition);
    for (const door of [doors[0], doors[Math.floor(doors.length / 2)], doors.at(-1)!]) for (const aspect of [16 / 9, 390 / 844]) {
      const point = door.boardingPath.at(-1)!, pose = { x: point.x, y: -6, z: point.y, yaw: 0 };
      const camera = new VictoryCamera();
      camera.capture(new Vector3(pose.x, -4, pose.z), new Vector3(0, 0, 1));
      for (const seconds of [0, 2, 12, 30]) {
        camera.update(pose, seconds, aspect, false, 0, true, 844, definition);
        const across = axis.direction === "x" ? camera.position.z - axis.center : axis.center - camera.position.x;
        const along = axis.direction === "x" ? camera.position.x : camera.position.z;
        expect(Math.abs(across - door.side * train.trackCentre)).toBeLessThanOrEqual(.65 + 1e-8);
        expect(Math.abs(along - door.carCentre)).toBeLessThanOrEqual(10.4 + 1e-8);
        expect(camera.position.y).toBeGreaterThanOrEqual(-5.55);
        expect(camera.position.y).toBeLessThanOrEqual(-6 + METRO_PROFILE.ceiling - METRO_PROFILE.floor - .2);
      }
    }
  });

  it("keeps security queues clear of ticket queues and walkable for luggage", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = new World(seed, 150, undefined, generateWorld(seed));
      const facilities = [...world.facilities.values()];
      for (const security of facilities.filter(f => f.def.kind === "security")) {
        let previous: { x: number; y: number } | undefined;
        for (let index = 0; index <= 8; index++) {
          const point = world.queueStandPoint(security, index, "luggage");
          expect(world.spatial.clearOfScenery(point, point, .48), `seed ${seed}, ${security.def.id}, slot ${index}`).toBe(true);
          if (previous) expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeGreaterThanOrEqual(.98 - 1e-6);
          previous = point;
          if (index > 5) continue;
          for (const machine of facilities.filter(f => f.def.kind === "tvm")) for (let ticketSlot = 0; ticketSlot <= 5; ticketSlot++) {
            const other = world.queueStandPoint(machine, ticketSlot);
            expect(Math.hypot(point.x - other.x, point.y - other.y), `seed ${seed}, ${security.def.id}, ${machine.def.id}`).toBeGreaterThanOrEqual(.82);
          }
        }
      }
    }
  });

  it("recovers an off-centre security queue head and completes the busy seed 5 journey", async () => {
    const engine = new Engine(5, {}, undefined, undefined, generateWorld(5));
    const runner = new GameRunner(engine, new HeuristicAgent(), async input => classifyByKeywords(input));
    await runner.runToEnd();
    expect(engine.status).toBe("success");
    expect(engine.player.onTrain).toBe(true);
  }, 30000);

  it("does not allow a switch to be operated from another floor", () => {
    const world = generateWorld(2), station = stationSwitch(world), engine = new Engine(2, {}, emptyScenario(2), undefined, world);
    engine.player.pos = { ...station.approach, floorId: "platform" };
    expect(engine.observe().blackout?.canOperate).toBe(false);
    expect(engine.applyAction({ type: "operate_switch", reason: "测试隔层" }).ok).toBe(false);
    engine.player.pos = { ...station.approach };
    expect(engine.observe().blackout?.canOperate).toBe(true);
    expect(engine.applyAction({ type: "operate_switch", reason: "测试同层" }).ok).toBe(true);
  });
});
