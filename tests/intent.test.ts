import { describe, expect, test } from "vitest";
import { parsePlan, type IntentContext } from "../src/sim/intent";
const context: IntentContext = {
  self: {
    position: {
      x: 5,
      y: 15
    },
    inventory: [{
      id: "i1",
      kind: "snack"
    }, {
      id: "i10",
      kind: "water_bottle"
    }]
  },
  people: [{
    id: "n1",
    look: "红色外套",
    position: {
      x: 6,
      y: 15
    },
    queue: "S2"
  }, {
    id: "n2",
    look: "蓝色外套",
    position: {
      x: 8,
      y: 15
    },
    queue: "S3"
  }],
  items: [{
    id: "i3",
    kind: "umbrella",
    position: {
      x: 7,
      y: 15
    }
  }],
  facilities: [{
    id: "S2",
    label: "二号安检"
  }]
};
describe("offline action plans", () => {
  test.each([["拿雨伞", "take"], ["捡雨伞", "take"], ["给最近的乘客零食", "give"], ["丢下水瓶", "drop"], ["扔水瓶到(x=6,y=15)", "drop"], ["向穿红色外套的乘客说你好", "talk"], ["向在 S3 排队的乘客要票", "talk"], ["威胁最近的乘客交票", "talk"], ["抢最近的乘客的票", "snatch"], ["推最近的乘客", "push"], ["击晕最近的乘客", "strike"], ["打最近的乘客", "strike"], ["翻闸", "vault"], ["翻栏杆", "vault"], ["滑扶手", "slide_handrail"], ["插队到最近的乘客前", "force_cut_in"], ["制造声音", "make_noise"], ["等2秒", "wait"], ["靠近 S2", "approach"]])("%s resolves to %s", (instruction, op) => {
    const plan = parsePlan(instruction, context);
    expect(plan.status).toBe("plan");
    expect(plan.steps[0].op).toBe(op);
  });
  test("nearest, outfit and queue references resolve visible people only", () => {
    expect(parsePlan("抢穿蓝色外套的乘客的票", context).steps[0]).toMatchObject({
      npcId: "n2"
    });
    expect(parsePlan("向在 S2 排队的乘客要票", context).steps[0]).toMatchObject({
      npcId: "n1"
    });
    expect(parsePlan("给最近的乘客 i10", context).steps[0]).toEqual({
      op: "give",
      itemId: "i10",
      toId: "n1"
    });
  });
  test("ambiguous, hidden, imaginary items and more than eight steps are rejected", () => {
    for (const text of ["推那位乘客", "拿车票", "给最近的乘客车票", "抢 n999 的票", "拿 i999"]) expect(parsePlan(text, context).status).toBe("needs_precondition");
    expect(parsePlan("飞到站台", context).status).toBe("unsupported");
    expect(parsePlan(Array(8).fill("等1秒").join("；"), context).steps).toHaveLength(8);
    expect(parsePlan(Array(9).fill("等1秒").join("；"), context).steps).toEqual([]);
  });
  test("a later give can refer to the item taken in an earlier step; trade offers are held goods", () => {
    expect(parsePlan("拿雨伞然后给最近的乘客雨伞", context).steps).toEqual([{
      op: "take",
      itemId: "i3"
    }, {
      op: "give",
      itemId: "i3",
      toId: "n1"
    }]);
    expect(parsePlan("用零食向最近的乘客换车票", context).steps[0]).toMatchObject({
      goal: "trade",
      offerItemId: "i1"
    });
  });
});
