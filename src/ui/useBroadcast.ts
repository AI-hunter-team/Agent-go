import { useEffect, useRef, useState } from "react";
import type { GameSession } from "./gameSession";
/** 新播报按重要性进入短队列，过期后收起，完整记录仍由世界事件提供。 */
export function useBroadcast(session: GameSession, enabled: boolean) {
  const seen = useRef({ generation: -1, count: 0 });
  const [queue, setQueue] = useState<{ text: string; priority: number }[]>([]);
  const count = session.engine.world.events.length;
  useEffect(() => {
    if (seen.current.generation !== session.generation || !enabled) {
      seen.current = { generation: session.generation, count: 0 };
      setQueue([]);
    }
    if (!enabled) return;
    const next = session.engine.world.events
      .slice(seen.current.count)
      .filter(
        (e) =>
          e.playerVisible && ["broadcast", "facility_status"].includes(e.kind),
      )
      .map((e) => ({
        text: e.text,
        priority: e.kind === "facility_status" ? 2 : 1,
      }));
    seen.current.count = count;
    if (next.length)
      setQueue((old) =>
        [...old, ...next].sort((a, b) => b.priority - a.priority).slice(0, 5),
      );
  }, [session, session.generation, count, enabled]);
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(
      () => setQueue((old) => old.filter((item) => item !== current)),
      5000,
    );
    return () => clearTimeout(timer);
  }, [current]);
  return current?.text ?? null;
}
