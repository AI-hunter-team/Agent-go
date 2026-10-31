import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { VictoryCamera } from "../src/ui/scene/victoryCamera";
import { Engine } from "../src/sim/engine";
import { buildScenario, SECURITY_STAFF_VISION } from "../src/sim/scenario";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { World } from "../src/sim/world";
import { BLACKOUT_SWITCH_REACH } from "../src/sim/layout";
import { stationSwitch } from "../src/sim/stationSwitch";
import { generatedTrainDoors, generatedTrainLayout } from "../src/shared/generatedTrain";
import { METRO_PROFILE } from "../src/shared/metro";
import { generateWorld, publicMap } from "../src/sim/worldDefinition";

const emptyScenario = (seed: number) => ({ seed, spawns: [], events: [], initialStatus: {} });

describe("generated station and mainline integration", () => {
  it("places the switch at a reachable, publicly named approach across generated layouts", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      if (seed % 10 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      const world = generateWorld(seed), station = stationSwitch(world);
      const engine = new Engine(seed, {}, emptyScenario(seed), undefined, world);
      expect(engine.world.navigation.findPath(world.layout.ENTRANCE, station.approach), `seed ${seed}`).not.toBeNull();
      expect(Math.hypot(station.position.x - station.approach.x, station.position.y - station.approach.y)).toBeLessThanOrEqual(BLACKOUT_SWITCH_REACH);
      expect(publicMap(world).nodes.find(node => node.id === "BLACKOUT_SWITCH")?.pos).toEqual(station.approach);
      expect(engine.applyAction({ type: "move_to", target: "BLACKOUT_SWITCH", reason: "前往电闸" }).ok).toBe(true);
    }
  }, 120000);

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

  it("keeps security queues clear of ticket queues and walkable for luggage", async () => {
    for (let seed = 1; seed <= 50; seed++) {
      if (seed % 10 === 0) await new Promise<void>(resolve => setImmediate(resolve));
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
          for (const machine of facilities.filter(f => f.def.kind === "tvm" || f.def.kind === "security" && f.def.id > security.def.id)) for (let ticketSlot = 0; ticketSlot <= 5; ticketSlot++) {
            const other = world.queueStandPoint(machine, ticketSlot);
            expect(Math.hypot(point.x - other.x, point.y - other.y), `seed ${seed}, ${security.def.id}, ${machine.def.id}`).toBeGreaterThanOrEqual(.82 - 1e-6);
          }
        }
      }
    }
  }, 120000);

  it("realigns an off-centre security queue head and completes service", () => {
    const world = generateWorld(5), engine = new Engine(5, {}, emptyScenario(5), undefined, world);
    engine.guards.guards.splice(0);
    const facility = engine.world.facility("S1")!, head = facility.def.head, direction = facility.def.queueDirection!;
    const side = { x: direction.y, y: -direction.x };
    engine.player.pos = { ...head, x: head.x + direction.x * .35 + side.x * .414, y: head.y + direction.y * .35 + side.y * .414 };
    facility.queue.push(engine.player.id);
    engine.player.activity = { kind: "queued", facility: facility.def.id };
    for (let tick = 0; tick < 250 && !engine.player.screened; tick++) engine.step();
    expect(engine.player.screened).toBe(true);
    expect(engine.world.layout.zoneOf(engine.player.pos)).toBe("concourse");
  });

  it("lets an offset queue head pass a later arrival and reach service", () => {
    const engine = new Engine(27, {}, emptyScenario(27), undefined, generateWorld(27));
    engine.guards.guards.splice(0);
    const facility = engine.world.facility("S2")!, head = facility.def.head;
    engine.player.pos = { ...head, x: head.x - .263, y: head.y - 1.651 };
    const later = engine.world.addPerson("normal", { ...head, y: head.y - .944 });
    facility.queue.push(engine.player.id, later.id);
    engine.player.activity = { kind: "queued", facility: facility.def.id };
    later.activity = { kind: "queued", facility: facility.def.id };
    for (let tick = 0; tick < 350 && !engine.player.screened; tick++) engine.step();
    expect(engine.player.screened).toBe(true);
  });

  it("applies balanced security vision and staffing to generated and legacy maps", () => {
    for (const seed of [1, 2, 4, 19]) {
      const definition = generateWorld(seed), staff = definition.guards.filter(guard => guard.role === "security_staff");
      expect(staff).toHaveLength(2);
      expect(staff.every(guard => guard.sightRange === SECURITY_STAFF_VISION.range && guard.sightFovDeg === SECURITY_STAFF_VISION.fovDeg)).toBe(true);
      expect(staff.every(guard => definition.layout.FACILITIES.some(facility => `security-${facility.id}` === guard.id))).toBe(true);
    }
    expect(new Engine(1).guards.guards.filter(guard => guard.role === "security_staff").map(guard => guard.def.id)).toEqual(["security-S1", "security-S3"]);
  });

  it("reroutes from an approaching queue only after its closure is visible", async () => {
    const engine = new Engine(26, {}, emptyScenario(26), undefined, generateWorld(26));
    const facility = engine.world.facility("S3")!;
    engine.world.items.spawn("ticket", { type: "held", personId: engine.player.id, slot: "pocket" }, engine.player.id);
    engine.player.pos = { ...facility.def.head, x: facility.def.head.x - 2 };
    engine.player.activity = { kind: "to_queue", facility: facility.def.id, path: [{ ...facility.def.head }] };
    engine.world.setStatus(facility.def.id, "closed", "临时停用");
    const observation = engine.observe();
    expect(observation.facilities).toEqual(expect.arrayContaining([expect.objectContaining({ id: "S3", status: "closed" })]));
    const agent = new HeuristicAgent();
    const visible = await agent.decide({ triggers: [], lastResult: null, observation });
    expect(visible.action).toMatchObject({ type: "join_queue" });
    expect(visible.action?.type === "join_queue" && visible.action.facility).not.toBe("S3");
    observation.facilities = observation.facilities.filter(f => f.id !== "S3");
    const hidden = await agent.decide({ triggers: [], lastResult: null, observation });
    expect(hidden.action).toMatchObject({ type: "wait" });
  });

  it("only starts a generated station blackout from an explicit switch action", () => {
    for (const seed of [1, 2, 4, 19]) {
      const world = generateWorld(seed), scenario = buildScenario(seed, {}, world.layout);
      expect(scenario.events.some(event => event.type === "power")).toBe(false);
      expect(scenario.events.filter(event => event.type === "recheck").every(event => world.layout.FACILITIES.some(f => f.id === event.facility))).toBe(true);
    }
  });

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
