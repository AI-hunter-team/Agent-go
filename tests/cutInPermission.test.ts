import { expect, test } from "vitest";
import { allowsCutIn, filterUnrequestedCutIn } from "../src/shared/strategyPermissions";
import { buildSystemPrompt } from "../server/prompts";
import { agentToolsForGuidance } from "../server/tools";

test.each(["", "赶时间，尽快到站台", "逃票", "翻闸机", "不择手段尽快过关", "和 NPC 聊聊", "观察别人插队", "不要插队", "不插队", "别加塞", "禁止向NPC求助", "不要和前面乘客商量", "允许插队，但最后不要插队", "我没说可以插队", "do not cut in line"])("keeps negotiation closed for non-permission guidance: %j", (guidance) => {
  expect(allowsCutIn(guidance)).toBe(false);
  const prompt = buildSystemPrompt(guidance, null);
  expect(prompt.rules).not.toContain("request_cut_in");
  expect(agentToolsForGuidance(guidance).some((tool) => tool.name === "request_cut_in")).toBe(false);
});

test.each(["插队", "必要时可以插队", "尝试加塞", "和前面乘客商量", "跟前面的乘客沟通一下", "向NPC求助", "找乘客帮个忙", "请求别人让位", "请前面的人让我先办理", "问前面乘客能不能让我先过", "能不能向NPC求助", "找别人帮忙", "特别着急可以插队", "ask an NPC for help", "cut in line"])("opens negotiation after the user's own strategy idea: %j", (guidance) => {
  expect(allowsCutIn(guidance)).toBe(true);
  expect(buildSystemPrompt(guidance, null).rules).toContain("request_cut_in");
  expect(agentToolsForGuidance(guidance).some((tool) => tool.name === "request_cut_in")).toBe(true);
});

test("model normalization cannot invent permission or teach an unrequested strategy", () => {
  const normalized = { summary: "可以插队节省时间", risk: "", priorities: ["尽快到达"], rules: [], creativeIdeas: ["和前面乘客商量插队"], notExecutable: [], initialPlan: ["先买票", "向 NPC 求助"] };
  const filtered = filterUnrequestedCutIn("尽快到站台", normalized)!;
  expect(filtered.creativeIdeas).toEqual([]);
  expect(filtered.initialPlan).toEqual(["先买票"]);
  const prompt = buildSystemPrompt("尽快到站台", normalized);
  expect(prompt.guidance).not.toMatch(/插队|求助/);
  expect(agentToolsForGuidance("尽快到站台").some((t) => t.name === "request_cut_in")).toBe(false);
  expect(filterUnrequestedCutIn("向 NPC 求助", normalized)).toEqual(normalized);
});

test.each(["我不插队", "我不会插队", "绝不插队", "不和前面乘客商量", "我不会向NPC求助", "I will not cut in line", "前面的乘客正在插队", "看到乘客插队", "NPC正在向我求助"])("ordinary denials and other people's actions do not grant permission: %j", (guidance) => {
  expect(allowsCutIn(guidance)).toBe(false);
  expect(agentToolsForGuidance(guidance).some((t) => t.name === "request_cut_in")).toBe(false);
});

test.each(["请别的乘客帮个忙", "找别的NPC求助", "分别向NPC求助", "向个别乘客求助"])("affirmative requests are not mistaken for the prohibitive 别: %j", (guidance) => {
  expect(allowsCutIn(guidance)).toBe(true);
});

test("normalization filters paraphrased social shortcuts and keeps raw-guidance authority", () => {
  const normalized = { summary: "赶车", risk: "", priorities: [], rules: [], creativeIdeas: ["请前面的人通融一下"], notExecutable: [], initialPlan: ["向前面的乘客请求通融以便提前办理", "先买票"] };
  const filtered = filterUnrequestedCutIn("尽快到站台", normalized)!;
  expect(filtered.creativeIdeas).toEqual([]);
  expect(filtered.initialPlan).toEqual(["先买票"]);
  expect(buildSystemPrompt("尽快到站台", normalized).guidance).not.toContain("通融");
});

test.each(["不要随便插队", "不允许任何形式的插队", "不要随意向NPC求助", " 前面的乘客正在插队"])("modifiers and leading whitespace do not grant access: %j", (guidance) => {
  expect(allowsCutIn(guidance)).toBe(false);
});

test("a request to avoid hesitation still grants the user's social strategy", () => {
  expect(allowsCutIn("不用犹豫向NPC求助")).toBe(true);
});
