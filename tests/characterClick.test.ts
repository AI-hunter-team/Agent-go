import { describe, expect, it, vi } from "vitest";
import { CharacterClick, type CaptureTarget } from "../src/ui/scene/characterClick";

/** 模拟 R3F 指针捕获；离开角色后的移动仍会投递给持有捕获的角色。 */
function pointer() {
  const captured = new Set<number>();
  const target: CaptureTarget = {
    setPointerCapture: vi.fn((id) => { captured.add(id); }),
    hasPointerCapture: vi.fn((id) => captured.has(id)),
    releasePointerCapture: vi.fn((id) => { captured.delete(id); }),
  };
  const event = (id: number, x: number, y: number, button = 0) => ({ pointerId: id, clientX: x, clientY: y, button, target });
  return { target, event, captured };
}

describe("主角点击手势", () => {
  it("按下后捕获指针；拖出角色再回原处松开不会问候", () => {
    const { target, event, captured } = pointer(), click = new CharacterClick();
    click.down(event(1, 10, 10));
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    click.move(event(1, 50, 10));
    click.move(event(1, 10, 10));
    expect(click.up(event(1, 10, 10))).toBe(false);
    expect(captured.has(1)).toBe(false);
  });

  it("短距离点击成功；其他指针和右键不能结束或创建手势", () => {
    const { target, event, captured } = pointer(), click = new CharacterClick();
    click.down(event(1, 10, 10, 2));
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    click.down(event(1, 10, 10));
    click.move(event(2, 100, 100));
    expect(click.up(event(2, 10, 10))).toBe(false);
    expect(captured.has(1)).toBe(true);
    expect(click.up(event(1, 12, 11))).toBe(true);
    expect(captured.size).toBe(0);
  });

  it("取消后释放捕获且不问候，可开始下一次点击", () => {
    const { event, captured } = pointer(), click = new CharacterClick();
    click.down(event(7, 20, 20));
    click.cancel(event(8, 20, 20));
    expect(captured.has(7)).toBe(true);
    click.cancel(event(7, 20, 20));
    expect(captured.size).toBe(0);
    expect(click.up(event(7, 20, 20))).toBe(false);
    click.down(event(9, 30, 30));
    expect(click.up(event(9, 30, 30))).toBe(true);
    click.down(event(10, 30, 30));
    click.reset();
    expect(captured.size).toBe(0);
    expect(click.up(event(10, 30, 30))).toBe(false);
  });
});
