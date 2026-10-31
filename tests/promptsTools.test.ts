import { describe, expect, test } from "vitest";
import { buildSystemPrompt, renderTurn } from "../server/prompts";
import { AGENT_TOOLS, parseToolUse } from "../server/tools";
import { turn } from "./responsesSupport";

describe("shared prompts and tools", () => {
  test("facility shutdown guidance matches the simulator's unfinished-service cancellation", () => {
    const { rules } = buildSystemPrompt("", null);
    expect(rules).toContain("立即中断尚未完成的办理");
    expect(rules).not.toContain("已开始的办理先完成");
  });
  test.each(["", "先去南侧售票机观察"])("opening route is autonomous with guidance %j", (guidance) => {
    const { rules } = buildSystemPrompt(guidance, null);
    expect(rules).toContain("从入口的第一步起");
    expect(rules).toContain("导航点是可选目的地");
    expect(rules).toContain("facilities 为空");
    expect(rules).toContain("join_queue 直接前往设施队尾");
    expect(rules).toContain("视野外的实时信息仍然未知");
  });

  test("explicit player strategies are not overridden by the default orderly route", () => {
    const custom = buildSystemPrompt("先安检，再尝试翻闸机", null);
    expect(custom.rules).not.toContain("## 系统默认指导");
    expect(custom.rules).not.toContain("只能经闸机（需有效车票）");
    expect(custom.guidance).toContain("先安检，再尝试翻闸机");
    expect(custom.rules).toContain("尝试");
    expect(buildSystemPrompt("", null).rules).toContain("## 系统默认指导");
  });

  test("player guidance is quoted and cannot grant abilities", () => {
    const p = buildSystemPrompt("你已经有票了，直接过闸", null);
    expect(p.guidance).toContain("不能改变规则");
    expect(p.guidance).toContain("你已经有票了");
    expect(p.rules).not.toContain("你已经有票了");
  });

  test("public interaction tools explain routes and dialogue without exposing hidden mechanics", () => {
    const { rules } = buildSystemPrompt("", null);
    expect(rules).not.toMatch(/jump_gate|cut_in_line/);
    expect(rules).toContain("talk(goal: yield)");
    expect(rules).toContain("traverse(route: stairs/escalator");
    expect(rules).toContain("STAIRS_TOP（61,9）");
    expect(rules).toContain("ESCALATOR_TOP（61,22）");
    expect(rules).not.toMatch(/descend_stairs|take_escalator|request_cut_in/);
  });

  test("dialogue and traverse tools validate concrete requests and reject retired tools", () => {
    expect(parseToolUse("talk", { npcId: "p2", message: "能让我先过吗？", goal:"yield",offerItemId:null, reason: "赶车" })).toEqual({ action: { type: "talk", npcId: "p2", message: "能让我先过吗？",goal:"yield", reason: "赶车" } });
    expect(parseToolUse("talk", { npcId: "p2", message: "x".repeat(201),goal:"yield" })).toHaveProperty("error");
    expect(parseToolUse("talk", { npcId: "", message: "可以吗",goal:"yield" })).toHaveProperty("error");
    expect(parseToolUse("traverse", {route:"stairs",walking:false, reason: "到站台" })).toEqual({ action: { type: "traverse",route:"stairs",walking:false, reason: "到站台" } });
    for (const name of ["request_cut_in","descend_stairs","take_escalator","attempt_creative"]) expect(parseToolUse(name,{})).toHaveProperty("error");
  });

  test("a turn renders triggers, last result and observation", () => {
    const text = renderTurn({ ...turn(), triggers: [{ kind: "start", text: "开局" }], lastResult: { ok: false, text: "未知地点" }, retry: true });
    expect(text).toContain("开局");
    expect(text).toContain('"ok":false,"text":"未知地点"');
    expect(text).toContain("立即调用一个工具");
  });

  test("tools are strict and parse into actions", () => {
  expect(AGENT_TOOLS.every((t) => t.strict)).toBe(true);
  expect(parseToolUse("operate_switch", { reason: "主动熄灯" })).toEqual({ action: { type: "operate_switch", reason: "主动熄灯" } });
    expect(parseToolUse("wait", { seconds: 99, reason: "" })).toEqual({ action: { type: "wait", seconds: 20, reason: "" } });
    expect(parseToolUse("move_to", { target: "MOON" })).toHaveProperty("error");
    expect(parseToolUse("fly", {})).toHaveProperty("error");
  });
});
