import { expect, test } from "vitest";
import { layoutHeadMessages, type MessageBox } from "../src/ui/scene/headMessageLayout";

const bounds = { width: 640, height: 420 };
const overlaps = (a: MessageBox, b: MessageBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("consecutive nearby speakers keep separate readable bubbles", () => {
  const messages = [
    { id: "player", x: 200, y: 190, width: 250, height: 110, priority: 10 },
    { id: "p1", x: 210, y: 170, width: 250, height: 100, priority: 2 },
    { id: "p2", x: 220, y: 180, width: 220, height: 100, priority: 1 },
  ];
  const placed = layoutHeadMessages(messages, bounds);
  expect(placed).toHaveLength(3);
  for (const [i, box] of placed.entries()) {
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(632);
    expect(box.y + box.height).toBeLessThanOrEqual(412);
    for (const other of placed.slice(i + 1)) expect(overlaps(box, other)).toBe(false);
  }
});

test("edge bubbles stay inside a narrow scene instead of being clipped", () => {
  const placed = layoutHeadMessages([
    { id: "player", x: -120, y: -80, width: 250, height: 120, priority: 2 },
    { id: "p1", x: 230, y: 340, width: 250, height: 120, priority: 1 },
  ], { width: 320, height: 380 });
  expect(placed).toHaveLength(2);
  for (const box of placed) {
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(312);
    expect(box.y + box.height).toBeLessThanOrEqual(372);
  }
  expect(overlaps(placed[0], placed[1])).toBe(false);
});

test("a solitary bubble keeps its original position", () => {
  expect(layoutHeadMessages([{ id: "p1", x: 90, y: 70, width: 200, height: 90, priority: 1 }], bounds))
    .toMatchObject([{ id: "p1", x: 90, y: 70 }]);
});

test("limited space preserves higher priority messages without stacking old ones over them", () => {
  const placed = layoutHeadMessages([
    { id: "old", x: 8, y: 8, width: 280, height: 130, priority: 1 },
    { id: "new", x: 8, y: 8, width: 280, height: 130, priority: 2 },
    { id: "player", x: 8, y: 8, width: 280, height: 130, priority: Infinity },
  ], { width: 300, height: 300 });
  expect(placed.map(box => box.id)).toEqual(["player", "new"]);
  expect(overlaps(placed[0], placed[1])).toBe(false);
});
