import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { JourneyProgress } from "../src/ui/JourneyProgress";

function render(engine: Engine) {
  return renderToStaticMarkup(createElement(JourneyProgress, { player: engine.player, status: engine.status }));
}

test("the normal journey explicitly includes a gate step before entering the platform", () => {
  const html = render(new Engine(1));
  const labels = ["买票", "安检", "过闸机", "下楼梯", "进入站台"];
  for (const label of labels) expect(html).toContain(label);
  expect(html.indexOf("过闸机")).toBeLessThan(html.indexOf("进入站台"));
  expect(html.indexOf("过闸机")).toBeLessThan(html.indexOf("下楼梯"));
  expect(html.indexOf("下楼梯")).toBeLessThan(html.indexOf("进入站台"));
  expect(html).toContain("当前阶段：买票");
});

test("passing security advances to the gate stage, not straight to the platform", () => {
  const engine = new Engine(1);
  engine.world.items.spawn("ticket", { type: "held", personId: engine.player.id, slot: "pocket" }, engine.player.id);
  expect(render(engine)).toContain("当前阶段：安检");
  engine.player.screened = true;
  expect(render(engine)).toContain("当前阶段：过闸机");
  engine.player.activity = { kind: "queued", facility: "G2" };
  expect(render(engine)).toContain("G2 排队中");
  engine.player.activity = { kind: "service", facility: "G2" };
  expect(render(engine)).toContain("G2 验票通行中");
  expect(render(engine)).toContain('aria-label="进入站台：待开始"');
});

test("passing a gate completes only the gate step and advances to stairs", () => {
  const engine = new Engine(1);
  engine.world.items.spawn("ticket", { type: "held", personId: engine.player.id, slot: "pocket" }, engine.player.id);
  Object.assign(engine.player, { screened: true, passedGate: true });
  let html = render(engine);
  expect(html).toContain('aria-label="过闸机：已完成"');
  expect(html).toContain('aria-label="下楼梯：进行中"');
  expect(html).toContain('aria-label="进入站台：待开始"');
  expect(html).toContain("当前阶段：下楼梯");
  engine.player.activity = { kind: "stairs", remaining: 3, start: { x: 48, y: 15 } };
  html = render(engine);
  expect(html).toContain("正在下楼梯");
  expect(html).toContain("剩余 3 秒");
});

test("only platform arrival completes the stairs and platform steps", () => {
  const engine = new Engine(1);
  engine.world.items.spawn("ticket", { type: "held", personId: engine.player.id, slot: "pocket" }, engine.player.id);
  engine.player.screened = true;
  engine.player.onPlatform = true;
  engine.status = "success";
  const html = render(engine);
  expect(html).toContain('aria-label="过闸机：已完成"');
  expect(html).toContain('aria-label="下楼梯：已完成"');
  expect(html).toContain("当前阶段：进入站台");
});

test("the gate stage shows a missing ticket without pretending that a creative route bought one", () => {
  const engine = new Engine(1);
  engine.player.screened = true;
  expect(render(engine)).toContain("未持有效车票");
  engine.player.onPlatform = true;
  engine.status = "success";
  expect(render(engine)).toContain('aria-label="买票：未购票"');
});
