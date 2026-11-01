import { describe, expect, test } from "vitest";
import type { NpcResponse } from "../src/shared/types";
import { offlineNpcResponse } from "../src/sim/dialogue";
import { createFixtureEngine } from "./fixtures/scenarios";
const reply = (patch: Partial<NpcResponse> = {}): NpcResponse => ({
  reply: "可以。",
  decision: "accept",
  give: "ticket",
  want: null,
  reason: "fixture",
  source: "offline",
  ...patch
});
function setup() {
  const e = createFixtureEngine();
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
  n.facing = Math.PI;
  return {
    e,
    n
  };
}
describe("simulator dialogue settlement", () => {
  test.each(["persuade", "chat"] as const)("an accepted %s can transfer a real voluntarily gifted ticket", goal => {
    const { e, n } = setup();
    const ticket = e.world.items.holdings(n.id).find(i => i.kind === "ticket")!;
    expect(e.applyAction({ type: "talk", npcId: n.id, message: "我真的很需要这张车票，能帮帮我吗", goal, reason: "测试赠送" }).ok).toBe(true);
    expect(e.dialogue.apply(reply()).ok).toBe(true);
    expect(e.player.hasTicket).toBe(true); expect(n.hasTicket).toBe(false);
    expect(ticket.ownerId).toBe("player"); expect(e.world.items.holderId(ticket)).toBe("player");
    expect(e.world.items.transfers.some(t => t.itemId === ticket.id && t.how === "dialogue")).toBe(true);
  });
  test("refusing persuasion leaves goods and legal ownership unchanged", () => {
    const { e, n } = setup(); const ticket = e.world.items.holdings(n.id).find(i => i.kind === "ticket")!;
    e.applyAction({ type: "talk", npcId: n.id, message: "请送我票", goal: "persuade", reason: "测试" });
    e.dialogue.apply(reply({ decision: "refuse", give: null }));
    expect(e.player.hasTicket).toBe(false); expect(ticket.ownerId).toBe(n.id); expect(e.world.items.holderId(ticket)).toBe(n.id);
  });
  test("queued conversation and a refused yield keep the player's original place", () => {
    const { e, n } = setup();
    const f = e.world.facility("TVM-2")!;
    f.queue = [n.id, "player"];
    n.pos = e.world.queueStandPoint(f, 0);
    n.activity = { kind: "queued", facility: f.def.id };
    e.player.pos = e.world.queueStandPoint(f, 1, "player");
    e.player.activity = { kind: "queued", facility: f.def.id };
    const before = [...f.queue];

    expect(e.applyAction({ type: "talk", npcId: n.id, message: "可以让我先走吗", goal: "yield", reason: "" }).ok).toBe(true);
    expect(e.executor.pendingDialogue).not.toBeNull();
    expect(f.queue).toEqual(before);
    const refused = e.dialogue.apply(reply({ decision: "refuse", give: null, reply: "我也赶时间，请排队", reason: "隐藏的性格判断" }));
    expect(refused).toMatchObject({
      ok: true,
      dialogue: { npcId: n.id, goal: "yield", message: "可以让我先走吗", reply: "我也赶时间，请排队", decision: "refuse", goalAchieved: false },
    });
    expect(JSON.stringify(refused)).not.toContain("隐藏的性格判断");
    expect(f.queue).toEqual(before);
    expect(e.player.activity).toEqual({ kind: "queued", facility: f.def.id });

    expect(e.applyAction({ type: "talk", npcId: n.id, message: "你好", goal: "chat", reason: "" }).ok).toBe(true);
    expect(e.dialogue.apply(reply({ decision: "accept", give: null })).ok).toBe(true);
    expect(f.queue).toEqual(before);
    expect(e.player.activity).toEqual({ kind: "queued", facility: f.def.id });
  });

  test("an accepted yield leaves the old slot only when physical movement begins", () => {
    const { e, n } = setup(), f = e.world.facility("TVM-2")!;
    f.queue = [n.id, "player"];
    n.pos = e.world.queueStandPoint(f, 0);
    n.activity = { kind: "queued", facility: f.def.id };
    e.player.pos = e.world.queueStandPoint(f, 1, "player");
    e.player.activity = { kind: "queued", facility: f.def.id };
    expect(e.applyAction({ type: "talk", npcId: n.id, message: "请让我先走", goal: "yield", reason: "" }).ok).toBe(true);
    expect(f.queue).toEqual([n.id, "player"]);
    expect(e.dialogue.apply(reply({ decision: "accept", give: null }))).toMatchObject({
      ok: true, dialogue: { decision: "accept", goalAchieved: false, effectPending: true },
    });
    expect(f.queue).toEqual([n.id]);
    expect(e.player.activity.kind).toBe("creative");
  });

  test("trade can put a received object into the backpack when both hands are full", () => {
    const { e, n } = setup();
    const umbrella = e.world.items.spawn("umbrella", { type: "held", personId: n.id, slot: "hand" }, n.id);
    const offer = e.world.items.holdings("player").find(item => item.kind === "coins")!;
    for (let i = 0; i < 2; i++) e.world.items.spawn("water_bottle", { type: "held", personId: "player", slot: "hand" }, "player");
    expect(e.applyAction({ type: "talk", npcId: n.id, message: "用零钱换伞", goal: "trade", offerItemId: offer.id, reason: "" }).ok).toBe(true);
    expect(e.dialogue.apply(reply({ give: "umbrella" })).ok).toBe(true);
    expect(umbrella.location).toEqual({ type: "held", personId: "player", slot: "bag" });
    expect(e.world.items.bagUsed("player")).toBe(1);
    expect(e.world.items.holderId(offer)).toBe(n.id);
  });

  test("arrival produces a request and freezes world time until a response transfers a real ticket", () => {
    const {
      e,
      n
    } = setup();
    n.pos = {
      x: 12,
      y: 15
    };
    n.activity = {
      kind: "waiting",
      remaining: 100
    };
    expect(e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "给我车票可以吗",
      goal: "ask_ticket",
      reason: ""
    }).ok).toBe(true);
    expect(e.executor.pendingDialogue).toBeNull();
    for (let i = 0; i < 100 && !e.executor.pendingDialogue; i++) e.step();
    expect(e.executor.pendingDialogue?.request.npc.holdings).toContain("ticket");
    const frozen = {
      t: e.t,
      pos: {
        ...n.pos
      }
    };
    for (let i = 0; i < 10; i++) e.step();
    expect({
      t: e.t,
      pos: n.pos
    }).toEqual(frozen);
    expect(e.dialogue.apply(reply()).ok).toBe(true);
    expect(e.player.hasTicket).toBe(true);
    expect(n.hasTicket).toBe(false);
    expect(e.executor.busy).toBe(false);
  });
  test("models cannot manufacture goods, reuse spent tickets, or cause partial exchanges", () => {
    const {
      e,
      n
    } = setup();
    const offer = e.world.items.spawn("snack", {
      type: "held",
      personId: "player",
      slot: "hand"
    }, "player");
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "用零食换票",
      goal: "trade",
      offerItemId: offer.id,
      reason: ""
    });
    expect(e.dialogue.apply(reply({
      give: "umbrella"
    }))).toMatchObject({ ok: false, dialogue: { decision: "accept", goalAchieved: false } });
    expect(e.world.items.holderId(offer)).toBe("player");
    expect(n.hasTicket).toBe(true);
    for (let i = 0; i < 2; i++) e.world.items.spawn("water_bottle", {
      type: "held",
      personId: n.id,
      slot: "hand"
    }, n.id);
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "用零食换票",
      goal: "trade",
      offerItemId: offer.id,
      reason: ""
    });
    const count = e.world.items.transfers.length;
    expect(e.dialogue.apply(reply()).ok).toBe(false);
    expect(e.world.items.transfers).toHaveLength(count);
    expect(e.world.items.holderId(offer)).toBe("player");
    expect(n.hasTicket).toBe(true);
    e.world.items.useTicket(n.id);
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "给我票",
      goal: "ask_ticket",
      reason: ""
    });
    expect(e.dialogue.apply(reply()).ok).toBe(false);
    expect(e.player.hasTicket).toBe(false);
  });
  test("a hand-for-hand exchange succeeds atomically when both initially have full hands", () => {
    const {
      e,
      n
    } = setup();
    const give = e.world.items.spawn("umbrella", {
      type: "held",
      personId: n.id,
      slot: "hand"
    }, n.id);
    const offer = e.world.items.spawn("snack", {
      type: "held",
      personId: "player",
      slot: "hand"
    }, "player");
    for (const id of [n.id, "player"]) e.world.items.spawn("water_bottle", {
      type: "held",
      personId: id,
      slot: "hand"
    }, id);
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "交换吧",
      goal: "trade",
      offerItemId: offer.id,
      reason: ""
    });
    expect(e.dialogue.apply(reply({
      give: "umbrella"
    })).ok).toBe(true);
    expect(e.world.items.holderId(give)).toBe("player");
    expect(e.world.items.holderId(offer)).toBe(n.id);
    expect(give.ownerId).toBe("player");
  });
  test("changed distance or lost offer is revalidated after waiting for the reply", () => {
    const {
        e,
        n
      } = setup(),
      offer = e.world.items.holdings("player").find(i => i.kind === "coins")!;
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "换票",
      goal: "trade",
      offerItemId: offer.id,
      reason: ""
    });
    e.world.items.move(offer.id, {
      type: "ground",
      pos: {
        x: 7,
        y: 15
      }
    });
    expect(e.dialogue.apply(reply()).ok).toBe(false);
    expect(n.hasTicket).toBe(true);
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "给我票",
      goal: "ask_ticket",
      reason: ""
    });
    n.pos = {
      x: 50,
      y: 25
    };
    expect(e.dialogue.apply(reply()).ok).toBe(false);
    expect(n.hasTicket).toBe(true);
  });
  test("a threat is a danger event at its start even if refused; normal chat does not create alerts", () => {
    const {
      e,
      n
    } = setup();
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "交票，否则打你",
      goal: "threaten",
      reason: ""
    });
    expect(e.events.events.find(v => v.kind === "threaten")).toMatchObject({
      severity: "danger",
      actorId: "player",
      targetId: n.id
    });
    expect(e.alerts.get(n.id, "player")?.level).toBe("red");
    expect(e.dialogue.apply(reply({
      decision: "refuse",
      give: null
    })).ok).toBe(true);
    expect(e.events.ongoing.has("player")).toBe(false);
    expect(n.hasTicket).toBe(true);
    const other = setup();
    other.e.applyAction({
      type: "talk",
      npcId: other.n.id,
      message: "你好",
      goal: "chat",
      reason: ""
    });
    expect(other.e.alerts.get(other.n.id, "player")).toBeUndefined();
    expect(other.e.dialogue.apply(reply({
      decision: "comply_under_threat",
      give: "ticket"
    })).ok).toBe(false);
  });
  test("flee/call_guard decisions are directed reactions and a fourth round is refused", () => {
    const {
      e,
      n
    } = setup();
    for (const decision of ["refuse", "call_guard", "flee"] as const) {
      expect(e.applyAction({
        type: "talk",
        npcId: n.id,
        message: "你好",
        goal: "chat",
        reason: ""
      }).ok).toBe(true);
      expect(e.dialogue.apply(reply({
        decision,
        give: null
      })).ok).toBe(true);
    }
    expect(e.alerts.get(n.id, "player")?.level).toBe("red");
    expect(e.npcBrain.active.get(n.id)?.action).toBe("flee");
    expect(e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "你好",
      goal: "chat",
      reason: ""
    }).ok).toBe(false);
    expect(e.dialogue.history.get(n.id)).toHaveLength(3);
  });
  test("accepted yield uses physical movement and never teleports into the queue", () => {
    const {
        e,
        n
      } = setup(),
      f = e.world.facility("TVM-2")!;
    f.queue = [n.id];
    f.serving = {
      personId: "busy",
      remaining: 1000,
      recheck: false
    };
    n.pos = e.world.queueStandPoint(f, 0);
    n.activity = {
      kind: "queued",
      facility: f.def.id
    };
    e.player.pos = {
      x: n.pos.x - .8,
      y: n.pos.y + 1
    };
    const before = {
      ...e.player.pos
    };
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "请让我先过",
      goal: "yield",
      reason: ""
    });
    expect(e.dialogue.apply(reply({
      give: null
    })).ok).toBe(true);
    expect(e.player.pos).toEqual(before);
    expect(f.queue).not.toContain("player");
    for (let i = 0; i < 50; i++) {
      e.executor.step();
      e.world.stepPeopleAndFacilities();
      e.executor.finishFrame();
    }
    expect(f.queue).toEqual(["player", n.id]);
    expect(e.events.events.some(v => v.kind === "force_cut_in")).toBe(false);
  });
  test("offline responses use actual holdings and cancellation clears the pending request", () => {
    const {
      e,
      n
    } = setup();
    n.persona!.traits.courage = 0;
    e.applyAction({
      type: "talk",
      npcId: n.id,
      message: "交出票",
      goal: "threaten",
      reason: ""
    });
    const request = e.executor.pendingDialogue!.request;
    expect(offlineNpcResponse(request)).toMatchObject({
      decision: "comply_under_threat",
      give: "ticket"
    });
    request.npc.holdings = [];
    expect(offlineNpcResponse(request).give).toBeNull();
    e.executor.cancel();
    expect(e.executor.pendingDialogue).toBeNull();
    expect(e.executor.busy).toBe(false);
    expect(e.events.ongoing.has("player")).toBe(false);
  });
});
