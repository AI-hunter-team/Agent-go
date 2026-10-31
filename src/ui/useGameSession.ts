import { useEffect, useReducer, useRef, useState } from "react";
import { GameSession } from "./gameSession";

/** 独立推进模拟；静止时停止页面帧循环，阶段变化立即刷新，常规 HUD 可降频。 */
export function useGameSession(uiIntervalMs = 120) {
  const [session] = useState(() => new GameSession(1));
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const interval = useRef(uiIntervalMs);
  interval.current = uiIntervalMs;
  useEffect(() => {
    let raf = 0;
    let ticking = false;
    let last = performance.now();
    let lastUi = last;
    /** 仅在世界运行时续订帧；面板降频不会降低固定步长模拟的精度。 */
    const frame = (now: number) => {
      raf = 0;
      ticking = true;
      session.tick((now - last) / 1000);
      last = now;
      if (!session.frozen && now - lastUi >= interval.current) { lastUi = now; refresh(); }
      ticking = false;
      if (!session.frozen) raf = requestAnimationFrame(frame);
    };
    /** 阶段、决策和用户操作立即可见；恢复时重置现实时间，避免补算暂停时长。 */
    const changed = () => {
      refresh();
      if (ticking) return;
      if (session.frozen) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) { last = performance.now(); lastUi = last; raf = requestAnimationFrame(frame); }
    };
    const unsubscribe = session.subscribe(changed);
    changed();
    return () => { unsubscribe(); cancelAnimationFrame(raf); session.stop(); };
  }, [session]);
  return session;
}
