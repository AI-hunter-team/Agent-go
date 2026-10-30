import { useEffect, useRef } from "react";
import type { Engine } from "../sim/engine";
import { MAP_PX, drawStation, type RenderOptions } from "./render";

interface Props {
  /** Read every animation frame, so the canvas follows the simulation without React re-renders. */
  engineRef: React.MutableRefObject<Engine | null>;
  optionsRef: React.MutableRefObject<RenderOptions>;
}

export function MapCanvas({ engineRef, optionsRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_PX.w * dpr;
    canvas.height = MAP_PX.h * dpr;
    ctx.scale(dpr, dpr);
    let raf = 0;
    const frame = () => {
      if (engineRef.current) drawStation(ctx, engineRef.current, optionsRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, optionsRef]);

  return <canvas ref={canvasRef} className="map" style={{ width: MAP_PX.w, height: MAP_PX.h }} />;
}
