/** R3F 的事件目标负责同时捕获底层画布指针与角色命中。 */
export interface CaptureTarget {
  setPointerCapture(id: number): void;
  hasPointerCapture(id: number): boolean;
  releasePointerCapture(id: number): void;
}

type Point = { pointerId: number; clientX: number; clientY: number };
type Press = Point & { button: number; target: CaptureTarget };

/** 区分主角点击与镜头拖动；移动曾越过阈值后，回到原点也不算点击。 */
export class CharacterClick {
  private start: (Point & { target: CaptureTarget; dragged: boolean }) | null = null;

  down(event: Press) {
    if (event.button !== 0 || this.start) return;
    event.target.setPointerCapture(event.pointerId);
    this.start = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, target: event.target, dragged: false };
  }

  move(event: Point) {
    const start = this.start;
    if (start && event.pointerId === start.pointerId && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 6) start.dragged = true;
  }

  up(event: Point) {
    const start = this.start;
    if (!start || event.pointerId !== start.pointerId) return false;
    const clicked = !start.dragged && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <= 6;
    this.clear();
    return clicked;
  }

  cancel(event: Pick<Point, "pointerId">) {
    if (this.start?.pointerId === event.pointerId) this.clear();
  }

  reset() { this.clear(); }

  private clear() {
    const start = this.start;
    this.start = null;
    if (start?.target.hasPointerCapture(start.pointerId)) start.target.releasePointerCapture(start.pointerId);
  }
}
