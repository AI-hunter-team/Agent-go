import { describe, expect, test } from "vitest";
import type { ActionPlan, PlanStep } from "../src/shared/types";
import { createFixtureEngine, emptyScenario } from "./fixtures/scenarios";
import type { Engine } from "../src/sim/engine";
import { ESCALATOR_TOP } from "../src/sim/layout";
const plan = (...steps: PlanStep[]): ActionPlan => ({
  status: "plan",
  steps,
  summary: "test",
  reason: "",
  source: "keywords"
});
const setup = () => {
  const e = createFixtureEngine();
  e.player.pos = {
    x: 7,
    y: 15
  };
  return e;
};
const advance = (e: Engine, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) {
    e.world.t = Math.round((e.world.t + .1) * 10) / 10;
    e.executor.step();
    e.executor.finishFrame();
  }
};
describe("action executor lifecycle", () => {
  test.each([0.1, 20])("waiting %s seconds in a queue permits service without executing later steps", (seconds) => {
    const e = setup(), f = e.world.facility("TVM-2")!;
    f.queue = ["player"];
    e.player.pos = { ...f.def.head };
    e.player.activity = { kind: "queued", facility: f.def.id };
    expect(e.executor.start(plan({ op: "wait", seconds }, { op: "make_noise", level: "low" })).ok).toBe(true);
    expect(f.queue).toEqual(["player"]);
    e.step();
    expect(f.serving?.personId).toBe("player");
    expect(e.player.activity.kind).toBe("service");
    expect(e.executor.busy).toBe(false);
    expect(e.executor.outcomes.at(-1)?.text).toContain("后续步骤未执行");
    e.step();
    expect(e.player.activity.kind).toBe("service");
    expect(e.executor.busy).toBe(false);
  });

  test("waiting in an escalator queue retains membership and ends when boarding starts", () => {
    const e = setup(), transit = e.world.transit;
    for (const [id] of e.world.persons) if (id !== "player") e.world.persons.delete(id);
    transit.queue.splice(0, transit.queue.length, "player");
    transit.nextCrowdAt = Infinity;
    e.player.passedGate = true;
    e.player.pos = { ...ESCALATOR_TOP };
    e.player.activity = { kind: "escalator_queue", joinedAt: 0 };
    expect(e.executor.start(plan({ op: "wait", seconds: 20 })).ok).toBe(true);
    expect(transit.queue).toEqual(["player"]);
    e.step();
    expect(e.player.activity.kind).toBe("escalator");
    e.step();
    expect(e.player.activity.kind).toBe("escalator");
    expect(e.executor.busy).toBe(false);
  });

  test("a third carried item can be taken into an available backpack", () => {
    const e = setup();
    for (let i = 0; i < 2; i++) e.world.items.spawn("water_bottle", { type: "held", personId: "player", slot: "hand" }, "player");
    const item = e.world.items.spawn("snack", { type: "ground", pos: { ...e.player.pos } }, null);
    expect(e.executor.start(plan({ op: "take", itemId: item.id })).ok).toBe(true);
    advance(e, 2);
    expect(item.location).toEqual({ type: "held", personId: "player", slot: "bag" });
    expect(e.world.items.bagUsed("player")).toBe(1);
  });

  test("a full backpack and two full hands still reject a new item", () => {
    const e = setup();
    for (let i = 0; i < 2; i++) e.world.items.spawn("water_bottle", { type: "held", personId: "player", slot: "hand" }, "player");
    for (let i = 0; i < 4; i++) e.world.items.spawn("water_bottle", { type: "held", personId: "player", slot: "bag" }, "player");
    const item = e.world.items.spawn("snack", { type: "ground", pos: { ...e.player.pos } }, null);
    expect(e.executor.start(plan({ op: "take", itemId: item.id })).ok).toBe(false);
    expect(item.location.type).toBe("ground");
    expect(e.world.items.bagUsed("player")).toBe(4);
  });

  test("approaches, spends real duration, then takes and gives an existing item", () => {
    const e = setup(),
      item = e.world.items.spawn("umbrella", {
        type: "ground",
        pos: {
          x: 10,
          y: 15
        }
      }, null),
      n = e.world.addPerson("normal", {
        x: 10,
        y: 16
      });
    expect(e.executor.start(plan({
      op: "take",
      itemId: item.id
    }, {
      op: "give",
      itemId: item.id,
      toId: n.id
    })).ok).toBe(true);
    advance(e, .5);
    expect(e.player.pos.x).toBeGreaterThan(7);
    expect(e.world.items.holderId(item)).toBeNull();
    advance(e, 8);
    expect(e.world.items.holderId(item)).toBe(n.id);
    expect(item.ownerId).toBe(n.id);
    expect(e.executor.outcomes.map(o => o.ok)).toEqual([true, true]);
    const before = { ...e.player.pos };
    e.executor.start(plan({ op: "approach", target: { kind: "node", id: "ENTRANCE" } }));
    e.step();
    expect(e.player.pos).not.toEqual(before);
    expect(e.world.tickStarts.get("player")).toEqual(before);
  });
  test("take/give prerequisites preserve the queue; settlement rechecks possession", () => {
    const e = setup(),
      f = e.world.facility("TVM-2")!,
      item = e.world.items.spawn("ticket", {
        type: "ground",
        pos: {
          ...e.player.pos
        }
      }, null);
    f.queue.push("player");
    e.player.activity = {
      kind: "queued",
      facility: f.def.id
    };
    expect(e.executor.start(plan({
      op: "take",
      itemId: "i999"
    })).ok).toBe(false);
    expect(f.queue).toContain("player");
    e.executor.start(plan({
      op: "take",
      itemId: item.id
    }));
    advance(e, .5);
    const n = e.world.addPerson("normal", {
      x: 8,
      y: 15
    });
    e.world.items.move(item.id, {
      type: "held",
      personId: n.id,
      slot: "pocket"
    });
    advance(e, 2);
    expect(e.world.items.holderId(item)).toBe(n.id);
    expect(e.executor.outcomes.at(-1)?.ok).toBe(false);
  });
  test("full hands reject take, lost recipient interrupts give, and hidden targets cannot start", () => {
    const e = setup();
    const bag = e.world.items.bag("player")!;
    e.world.items.move(bag.id, { type: "ground", pos: { ...e.player.pos } }, "fixture");
    for (let i = 0; i < 2; i++) e.world.items.spawn("water_bottle", {
      type: "held",
      personId: "player",
      slot: "hand"
    }, "player");
    const i = e.world.items.spawn("snack", {
      type: "ground",
      pos: {
        ...e.player.pos
      }
    }, null);
    expect(e.executor.start(plan({
      op: "take",
      itemId: i.id
    })).ok).toBe(false);
    const held = e.world.items.holdings("player").find(v => v.kind === "coins")!,
      n = e.world.addPerson("normal", {
        x: 8,
        y: 15
      });
    expect(e.executor.start(plan({
      op: "give",
      itemId: held.id,
      toId: n.id
    })).ok).toBe(true);
    n.pos = {
      x: 65,
      y: 15
    };
    advance(e, 1);
    expect(e.world.items.holderId(held)).toBe("player");
    expect(e.executor.busy).toBe(false);
    expect(e.executor.start(plan({
      op: "push",
      npcId: n.id
    })).ok).toBe(false);
  });
  test("drop/throw use held goods, generate item noise, and preserve contents of a dropped bag", () => {
    const e = setup(),
      bag = e.world.items.bag("player")!,
      water = e.world.items.spawn("water_bottle", {
        type: "held",
        personId: "player",
        slot: "bag"
      }, "player");
    e.executor.start(plan({
      op: "drop",
      itemId: bag.id,
      mode: "drop"
    }));
    advance(e, .5);
    expect(bag.location.type).toBe("ground");
    expect(water.location).toEqual({
      type: "container",
      containerId: bag.id
    });
    expect(e.world.items.holderId(water)).toBeNull();
    const coin = e.world.items.holdings("player").find(i => i.kind === "coins")!;
    e.executor.start(plan({
      op: "drop",
      itemId: coin.id,
      mode: "throw",
      atPosition: { x:e.player.pos.x+1, y:e.player.pos.y }
    }));
    advance(e, 1);
    expect(e.events.events.find(v => v.kind === "item_thrown")?.loudness).toBe(0);
    expect(coin.location.type).toBe("flight");
    for(let tick=0;tick<6;tick++) e.step();
    expect(e.events.events.find(v => v.kind === "item_dropped" && v.itemId === coin.id && v.trajectory)?.loudness).toBe(6);
    expect(e.executor.start(plan({
      op: "drop",
      itemId: coin.id,
      mode: "drop"
    })).ok).toBe(false);
  });
  test("noise/wait last their duration and cancellation removes ongoing attribution", () => {
    const e = setup();
    e.executor.start(plan({
      op: "make_noise",
      level: "high"
    }, {
      op: "wait",
      seconds: 2
    }));
    expect(e.events.ongoing.has("player")).toBe(true);
    advance(e, .5);
    expect(e.executor.outcomes[0].ok).toBe(true);
    advance(e, .5);
    expect(e.executor.busy).toBe(true);
    advance(e, 2);
    expect(e.executor.busy).toBe(false);
    const n = e.world.addPerson("normal", {
      x: 8,
      y: 15
    }, {
      hasTicket: true
    });
    e.executor.start(plan({
      op: "snatch",
      npcId: n.id,
      itemKind: "ticket"
    }));
    e.executor.cancel();
    expect(e.events.ongoing.has("player")).toBe(false);
    expect(n.hasTicket).toBe(true);
  });
  test.each(["snatch", "push", "strike"] as const)("%s is a deterministic contest, with resistance and successful settlement", op => {
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 25; seed++) {
      const e = createFixtureEngine(emptyScenario(seed));
      e.player.pos = {
        x: 7,
        y: 15
      };
      const n = e.world.addPerson("normal", {
        x: 8,
        y: 15
      }, {
        hasTicket: true
      });
      n.facing = 0;
      n.persona!.traits.courage = 0;
      if (op === "strike") {
        // Exercise the defended contest; surprise is tested separately in instructionPipeline.
        const warning=e.events.emit({t:e.t,kind:"odd_behaviour",severity:"suspicious",actorId:"player",targetId:n.id,pos:{...e.player.pos},loudness:0});
        e.alerts.records.set(JSON.stringify([n.id,"player"]),{observerId:n.id,subjectId:"player",level:"yellow",ring:0,hiddenFor:0,since:e.t,causeEventId:warning.id,reaction:null});
      }
      const ticket = e.world.items.holdings(n.id)[0];
      const step: PlanStep = op === "snatch" ? {
        op,
        npcId: n.id,
        itemKind: "ticket"
      } : op === "strike" ? {
        op,
        npcId: n.id,
        aim: "knockout"
      } : {
        op,
        npcId: n.id
      };
      e.executor.start(plan(step));
      advance(e, 1);
      const ok = e.executor.outcomes.at(-1)!.ok;
      outcomes.add(ok);
      if (ok && op === "snatch") {
        expect(e.player.hasTicket).toBe(true);
        expect(ticket.ownerId).toBe(n.id);
      }
      if (ok && op === "strike") {
        const hit = e.events.events.find(v=>v.kind==="knockout");
        // This helper advances only the executor, so world wake timers do not tick.
        expect(n.incapacitated).toBe(hit ? 20 : 0);
      }
      if (ok && op === "push") expect(n.pos.x).toBeGreaterThan(8);
      if (!ok) expect(e.events.events.some(v => v.kind === "argument")).toBe(true);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });
  test("force cut-in reserves space, settles before the victim and cleans up interruption", () => {
    const e = setup(),
      f = e.world.facility("TVM-2")!,
      n = e.world.addPerson("normal", {
        x: 10,
        y: 15
      });
    f.serving = {
      personId: "busy",
      remaining: 1000,
      recheck: false
    };
    f.queue.push(n.id);
    n.activity = {
      kind: "queued",
      facility: f.def.id
    };
    e.player.pos = {
      x: 9,
      y: 15
    };
    // The target's physical place is the head of this fixed queue.
    n.pos = e.world.queueStandPoint(f, 0);
    e.player.pos = {
      x: n.pos.x - .8,
      y: n.pos.y + 1
    };
    e.executor.start(plan({
      op: "force_cut_in",
      npcId: n.id
    }));
    for (let i = 0; i < 40; i++) {
      e.executor.step();
      e.world.stepPeopleAndFacilities();
      e.executor.finishFrame();
    }
    expect(f.queue).toEqual(["player", n.id]);
    expect(e.world.cutInReservations.size).toBe(0);
    e.world.removeFromQueue(e.player);
    e.player.activity = {
      kind: "idle"
    };
    e.player.pos = {
      x: n.pos.x - .8,
      y: n.pos.y + 1
    };
    e.executor.start(plan({
      op: "force_cut_in",
      npcId: n.id
    }));
    e.executor.cancel();
    expect(e.world.cutInReservations.size).toBe(0);
  });
  test("active expulsion blocks forced insertion and closed facilities invalidate it", () => {
    const e = setup(),
      f = e.world.facility("TVM-2")!,
      n = e.world.addPerson("normal", e.world.facility("TVM-2")!.def.head);
    f.queue = [n.id];
    n.activity = {
      kind: "queued",
      facility: f.def.id
    };
    e.player.pos = {
      x: n.pos.x - .8,
      y: n.pos.y + 1
    };
    e.executor.start(plan({
      op: "force_cut_in",
      npcId: n.id
    }));
    e.npcBrain.react(n, e.player, {
      observerId: n.id,
      subjectId: "player",
      level: "yellow",
      ring: 0,
      hiddenFor: 0,
      since: 0,
      causeEventId: "missing",
      reaction: null
    }, e.player.pos, "expel");
    advance(e, 2);
    expect(f.queue).not.toContain("player");
    expect(e.executor.outcomes.at(-1)?.ok).toBe(false);
    // From the hall a railing vault first walks to the nearest low section.
    expect(e.executor.start(plan({
      op: "vault",
      obstacle: "railing"
    })).ok).toBe(true);
    expect(e.player.activity).toMatchObject({ kind: "acting", op: "approach" });
    e.executor.cancel();
    expect(e.executor.start(plan({
      op: "vault",
      obstacle: "escalator_side"
    })).ok).toBe(false);
    expect(e.executor.start(plan({
      op: "slide_handrail"
    })).ok).toBe(false);
  });
  test("a guard sees attack start before settlement; a rear attack can knock out without being seen", () => {
    const def = {
      id: "g",
      label: "测试保安",
      route: [{
        x: 30,
        y: 15
      }],
      facing: 0,
      speed: 0,
      pauseSeconds: 0
    };
    const front = createFixtureEngine(emptyScenario(), [def]);
    front.player.pos = {
      x: 31,
      y: 15
    };
    expect(front.applyAction({
      type: "act",
      instruction: "击晕最近的保安",
      reason: ""
    }).ok).toBe(true);
    expect(front.status).toBe("failed");
    expect(front.guards.guards[0].incapacitated).toBe(0);
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const e = createFixtureEngine(emptyScenario(seed), [def]);
      e.player.pos = {
        x: 29,
        y: 15
      };
      e.applyAction({
        type: "act",
        instruction: "击晕最近的保安",
        reason: ""
      });
      for (let i = 0; i < 10; i++) e.step();
      if (e.guards.guards[0].incapacitated > 0) {
        found = true;
        expect(e.status).toBe("running");
        const hit=e.events.events.find(v=>v.kind==="knockout")!;
        expect(e.guards.guards[0].incapacitated).toBeCloseTo(20-(e.t-hit.t));
      }
    }
    expect(found).toBe(true);
  });
  test("malformed plans, self targets and unreachable targets cannot mutate the world", () => {
    const e = setup(),
      before = {
        ...e.player.pos
      };
    for (const steps of [[], [{
      op: "teleport"
    }], [{
      op: "wait",
      seconds: NaN
    }], [{
      op: "approach",
      target: null
    }], Array(9).fill({
      op: "wait",
      seconds: 1
    })]) expect(e.executor.start({
      ...plan(),
      steps
    } as ActionPlan).ok).toBe(false);
    expect(e.executor.start(plan({
      op: "push",
      npcId: "player"
    })).ok).toBe(false);
    expect(e.executor.start(plan({
      op: "approach",
      target: {
        kind: "node",
        id: "STAIRS_TOP"
      }
    })).ok).toBe(false);
    expect(e.player.pos).toEqual(before);
  });
  test("plans are copied, item spots take time, and incapacitation cancels without transferring", () => {
    const e = setup();
    e.player.pos = {
      x: 8,
      y: 27
    };
    const umbrella = [...e.world.items.items.values()].find(i => i.kind === "umbrella")!;
    const original = plan({
      op: "take",
      itemId: umbrella.id
    });
    e.executor.start(original);
    original.steps[0] = {
      op: "wait",
      seconds: 20
    };
    advance(e, 1.4);
    expect(e.world.items.holderId(umbrella)).toBeNull();
    advance(e, .1);
    expect(e.world.items.holderId(umbrella)).toBe("player");
    const n = e.world.addPerson("normal", {
      x: 9,
      y: 27
    }, {
      hasTicket: true
    });
    e.executor.start(plan({
      op: "snatch",
      npcId: n.id,
      itemKind: "ticket"
    }));
    e.world.knockOut(e.player, 20);
    advance(e, 1);
    expect(n.hasTicket).toBe(true);
    expect(e.executor.busy).toBe(false);
    expect(e.events.ongoing.has("player")).toBe(false);
  });
  test("pushing is affecting, so a seeing victim and guard start yellow", () => {
    const e = createFixtureEngine(undefined, [{
      id: "g",
      label: "保安",
      route: [{
        x: 10,
        y: 15
      }],
      facing: Math.PI,
      speed: 0,
      pauseSeconds: 0
    }]);
    e.player.pos = {
      x: 7,
      y: 15
    };
    const n = e.world.addPerson("normal", {
      x: 8,
      y: 15
    });
    n.facing = Math.PI;
    e.executor.start(plan({
      op: "push",
      npcId: n.id
    }));
    e.resolveInteractions(0);
    expect(e.alerts.get(n.id, "player")?.level).toBe("yellow");
    expect(e.alerts.get("g", "player")?.level).toBe("yellow");
    expect(e.status).toBe("running");
  });
  test("dropping and picking up stolen goods does not erase the original owner", () => {
    const e = setup(),
      n = e.world.addPerson("normal", {
        x: 8,
        y: 15
      }, {
        hasTicket: true
      }),
      item = e.world.items.holdings(n.id)[0];
    e.world.items.move(item.id, {
      type: "ground",
      pos: {
        ...e.player.pos
      }
    }, "drop");
    e.executor.start(plan({
      op: "take",
      itemId: item.id
    }));
    advance(e, 1.5);
    expect(e.world.items.holderId(item)).toBe("player");
    expect(item.ownerId).toBe(n.id);
  });
  test("a confront reaction can attempt to reclaim only a real owned item through contest", () => {
    const results = new Set<boolean>();
    for (let seed = 1; seed <= 30; seed++) {
      const e = createFixtureEngine(emptyScenario(seed));
      e.player.pos = {
        x: 7,
        y: 15
      };
      const n = e.world.addPerson("normal", {
        x: 8,
        y: 15
      }, {
        hasTicket: true
      });
      const item = e.world.items.holdings(n.id)[0];
      e.world.items.move(item.id, {
        type: "held",
        personId: "player",
        slot: "pocket"
      }, "snatch");
      const event = e.events.emit({
        t: 0,
        kind: "snatch",
        severity: "violation",
        actorId: "player",
        targetId: n.id,
        itemId: item.id,
        pos: {
          x: 7,
          y: 15
        },
        loudness: 0
      });
      e.npcBrain.react(n, e.player, {
        observerId: n.id,
        subjectId: "player",
        level: "red",
        ring: 0,
        hiddenFor: 0,
        since: 0,
        causeEventId: event.id,
        reaction: null
      }, e.player.pos, "confront");
      e.npcBrain.step();
      results.add(n.hasTicket);
      expect(item.ownerId).toBe(n.id);
      expect(e.events.ongoing.get(n.id)?.kind).toBe("snatch");
      const count = e.events.events.filter(v => v.kind === "snatch" && v.actorId === n.id).length;
      e.npcBrain.step();
      expect(e.events.events.filter(v => v.kind === "snatch" && v.actorId === n.id)).toHaveLength(count);
    }
    expect(results).toEqual(new Set([true, false]));
  });
});
