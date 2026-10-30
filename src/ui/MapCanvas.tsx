import { useEffect, useRef } from "react";
import type { Engine } from "../sim/engine";
import { MAP_PX, MAP_REGIONS, drawStation, type RenderOptions } from "./render";

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

  return (
    <div className="station-map">
      <div className="map-regions" aria-label="地图区域" style={{ gridTemplateColumns: MAP_REGIONS.map((r) => `${r.end - r.start}fr`).join(" ") }}>
        {MAP_REGIONS.map((r) => <span key={r.label} style={{ background: r.color }}>{r.label}</span>)}
      </div>
      <canvas ref={canvasRef} className="map" aria-label="车站地图：售票厅、安检区、验票闸机、上层平台、下行楼梯和下层站台；通过闸机后需下楼梯到达站台" style={{ width: MAP_PX.w, height: MAP_PX.h }} />
      <div className="facility-key">
        <div className="facility-key-security">
          <svg viewBox="0 0 40 32" aria-hidden="true"><path d="M7 27V5h26v22h-5V10H12v17Z" fill="#b9d1dd" stroke="#527e91" strokeWidth="2"/><path d="M20 12v12" stroke="#527e91" strokeWidth="2" strokeDasharray="3 2"/></svg>
          <span><strong>安检通道 S1–S3</strong><small>人员与行李检查</small></span>
        </div>
        <div className="facility-key-gate">
          <svg viewBox="0 0 40 32" aria-hidden="true"><rect x="5" y="4" width="30" height="6" rx="2" fill="#d9bd79" stroke="#9b6c16"/><rect x="5" y="23" width="30" height="6" rx="2" fill="#d9bd79" stroke="#9b6c16"/><path d="m19 10 7 6-7 7Z" fill="#bd9345"/><circle cx="30" cy="7" r="2" fill="#6e8a74"/></svg>
          <span><strong>验票闸机 G1–G5</strong><small>刷票验证后通行</small></span>
        </div>
        <div className="facility-key-stairs">
          <svg viewBox="0 0 40 32" aria-hidden="true"><path d="M4 6h8v6h8v6h8v7h8" fill="none" stroke="#856a4d" strokeWidth="3"/><path d="m21 5 13 13m-8 0h8v-8" fill="none" stroke="#6e8a74" strokeWidth="2.5"/></svg>
          <span><strong>下楼梯 → 站台</strong><small>闸机后前往入口，下行约 6 秒</small></span>
        </div>
      </div>
    </div>
  );
}
