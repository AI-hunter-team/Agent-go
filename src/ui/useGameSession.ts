import { useEffect, useReducer, useState } from "react";
import { GameSession } from "./gameSession";
import { randomSeed } from "./seed";

export function useGameSession() {
  const [session] = useState(() => new GameSession(randomSeed()));
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const unsubscribe = session.subscribe(refresh);
    let raf = 0;
    let last = performance.now();
    let lastUi = last;
    const frame = (now: number) => {
      session.tick((now - last) / 1000);
      last = now;
      if (now - lastUi >= 120) { lastUi = now; refresh(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { unsubscribe(); cancelAnimationFrame(raf); session.stop(); };
  }, [session]);
  return session;
}
