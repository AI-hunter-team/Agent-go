import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { layoutHeadMessages, type MessageBox } from "./headMessageLayout";

interface Offset { x: number; y: number; signature: string; changedAt: number; }

/** Runs after the actor billboards; batch DOM reads before applying offsets. */
export function MessageBillboardLayout() {
  const { gl, size, events } = useThree();
  // Drei portals Html into the event container, outside the canvas sizing div.
  const container = (events.connected as HTMLElement | undefined) ?? gl.domElement.parentElement;
  const offsets = useRef(new WeakMap<HTMLElement, Offset>());
  useEffect(() => {
    container?.style.setProperty("--scene-message-max-width", `${Math.max(44, size.width - 16)}px`);
    container?.style.setProperty("--scene-message-max-text-height", `${Math.max(40, Math.min(160, size.height * .35))}px`);
    return () => {
      container?.style.removeProperty("--scene-message-max-width");
      container?.style.removeProperty("--scene-message-max-text-height");
    };
  }, [container, size.width, size.height]);
  useFrame(({ clock }) => {
    const viewport = gl.domElement.getBoundingClientRect();
    const elements = container?.querySelectorAll<HTMLElement>(".scene-message") ?? [];
    const boxes: MessageBox[] = [];
    const measured: { element: HTMLElement; offset: Offset; box: MessageBox }[] = [];
    for (const element of elements) {
      if (!element.offsetWidth || !element.offsetHeight) continue;
      const signature = `${element.dataset.mode}:${element.textContent}`;
      const offset = offsets.current.get(element) ?? { x: 0, y: 0, signature: "", changedAt: 0 };
      if (offset.signature !== signature) {
        offset.signature = signature;
        offset.changedAt = clock.elapsedTime;
      }
      const rect = element.getBoundingClientRect();
      const box = { id: element.dataset.actorId!, x: rect.left - viewport.left - offset.x,
        y: rect.top - viewport.top - offset.y, width: rect.width, height: rect.height,
        priority: element.dataset.speaker === "agent" ? Infinity : offset.changedAt };
      // Do not pull offscreen actors' bubbles into the frame.
      const anchor = element.parentElement!.getBoundingClientRect();
      if (anchor.left >= viewport.left && anchor.left <= viewport.right && anchor.top >= viewport.top && anchor.top <= viewport.bottom) boxes.push(box);
      measured.push({ element, offset, box });
    }
    const hud = boxes.length ? gl.domElement.closest("main")?.querySelectorAll<HTMLElement>("[data-scene-obstacle]") : [];
    const obstacles = [...(hud ?? [])].filter(element => element.offsetWidth && element.offsetHeight).map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left - viewport.left, y: rect.top - viewport.top, width: rect.width, height: rect.height };
    });
    const placed = new Map(layoutHeadMessages(boxes, viewport, obstacles).map(box => [box.id, box]));
    for (const { element, offset, box } of measured) {
      const target = placed.get(box.id);
      element.style.visibility = target ? "visible" : "hidden";
      if (target) {
        offset.x = target.x - box.x;
        offset.y = target.y - box.y;
        element.style.translate = `${offset.x}px ${offset.y}px`;
      }
      offsets.current.set(element, offset);
    }
  });
  return null;
}
