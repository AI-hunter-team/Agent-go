import { afterEach, expect, test, vi } from "vitest";
import { bindContextRecovery } from "../src/ui/scene/contextRecovery";

afterEach(() => vi.useRealTimers());
const callbacks = () => ({ lost: vi.fn(), restored: vi.fn(), failed: vi.fn() });
const lose = (canvas: EventTarget) => {
  const event = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
};

test("a transient loss preserves the canvas and cancels failure after native restoration", () => {
  vi.useFakeTimers();
  const canvas = new EventTarget(), events = callbacks(), dispose = bindContextRecovery(canvas, events);
  lose(canvas); lose(canvas);
  expect(events.lost).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000);
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  vi.advanceTimersByTime(10000);
  expect(events.restored).toHaveBeenCalledTimes(1);
  expect(events.failed).not.toHaveBeenCalled();
  // A second independent loss gets a fresh deadline.
  lose(canvas); vi.advanceTimersByTime(8000);
  expect(events.failed).toHaveBeenCalledTimes(1);
  dispose();
});

test("unmount cancels recovery work and removes canvas listeners", () => {
  vi.useFakeTimers();
  const canvas = new EventTarget(), events = callbacks(), dispose = bindContextRecovery(canvas, events);
  lose(canvas); dispose();
  canvas.dispatchEvent(new Event("webglcontextrestored"));
  vi.advanceTimersByTime(10000);
  expect(events.failed).not.toHaveBeenCalled();
  expect(events.restored).not.toHaveBeenCalled();
  const event = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
