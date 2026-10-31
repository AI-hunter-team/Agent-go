import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { generateWorld, publicMap } from "../src/sim/worldDefinition";
import { emptyScenario } from "./fixtures/scenarios";

const generated = () => new Engine(2, {}, emptyScenario(2), undefined, generateWorld(2));

describe("generated action targets", () => {
  test("joining a long curved security queue uses its actual reachable tail", () => {
    const e = generated(), f = e.world.facility("S3")!;
    for (let i = 0; i < 16; i++) {
      const n = e.world.addPerson("normal", f.def.head);
      f.queue.push(n.id);
      n.pos = e.world.queueStandPoint(f, i, n.kind);
      n.activity = { kind: "queued", facility: f.def.id };
    }
    const tail = e.world.queueStandPoint(f, f.queue.length, e.player.kind);
    expect(e.world.navigation.findPath(e.player.pos, tail)).not.toBeNull();
    expect(e.applyAction({ type: "join_queue", facility: f.def.id, reason: "" }).ok).toBe(true);
    expect(e.player.activity.kind === "to_queue" && e.player.activity.path.at(-1)).toEqual(tail);
  });

  test.each(["BLACKOUT_SWITCH", "TRAIN_DOOR"])("an advertised %s node also works in an approach plan", target => {
    const e = generated();
    const id = target === "TRAIN_DOOR" ? publicMap(e.world.definition).nodes.find(n => n.id.startsWith("TRAIN_"))!.id : target;
    if (id.startsWith("TRAIN_")) {
      e.player.pos = { ...e.world.layout.STAIRS_BOTTOM };
      e.player.passedGate = true;
      e.player.onPlatform = true;
    }
    const node = publicMap(e.world.definition).nodes.find(n => n.id === id)!;
    expect(node).toBeDefined();
    expect(e.applyAction({ type: "move_to", target: id, reason: "" }).ok).toBe(true);
    e.player.activity = { kind: "idle" };
    expect(e.executor.start({ status: "plan", steps: [{ op: "approach", target: { kind: "node", id } }], summary: "", reason: "", source: "keywords" }).ok).toBe(true);
    expect(e.executor.resolveRef({ kind: "node", id })).toEqual(node.pos);
  });
});
