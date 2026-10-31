import { worldViewBounds } from "../sim/entranceGeometry";
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
      const engine=engineRef.current;
      if(engine){const d=engine.world.definition,b=worldViewBounds(d);const w=d.generatorVersion!=="legacy-v0"?b.w*16:MAP_PX.w,h=d.generatorVersion!=="legacy-v0"?(b.h*2+4)*16:MAP_PX.h;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);}drawStation(ctx,engine,optionsRef.current);}
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, optionsRef]);

  const generated = engineRef.current?.world.definition.generatorVersion!=="legacy-v0";
  const regions = generated ? [{ label: "B1 · 站厅（非付费区 → 安检 → 闸机 → 付费区）", start: 0, end: 1, color: "#e5ddca" }, { label: "B2 · 岛式站台（楼梯 / 扶梯下行）", start: 1, end: 2, color: "#c6d8d5" }] : MAP_REGIONS;
  return (
    <div className="station-map">
      <div className="map-regions" aria-label="地图区域" style={{ gridTemplateColumns: regions.map((r) => `${r.end - r.start}fr`).join(" ") }}>
        {regions.map((r) => <span key={r.label} style={{ background: r.color }}>{r.label}</span>)}
      </div>
      <canvas ref={canvasRef} className="map" aria-label={generated ? "双层车站地图：上图为站厅，下图为岛式站台；通过闸机后沿楼梯或扶梯下行" : "车站地图：售票厅、安检区、验票闸机、下行楼梯、下层站台和地铁车门；到站台后还需登上地铁"} style={{ width: "100%", height: "auto", display: "block" }} />
      <div className="facility-key">
        <div className="facility-key-security">
          <svg viewBox="0 0 40 32" aria-hidden="true"><path d="M7 27V5h26v22h-5V10H12v17Z" fill="#b9d1dd" stroke="#527e91" strokeWidth="2"/><path d="M20 12v12" stroke="#527e91" strokeWidth="2" strokeDasharray="3 2"/></svg>
          <span><strong>安检通道</strong><small>人员与行李检查</small></span>
        </div>
        <div className="facility-key-gate">
          <svg viewBox="0 0 40 32" aria-hidden="true"><rect x="5" y="4" width="30" height="6" rx="2" fill="#d9bd79" stroke="#9b6c16"/><rect x="5" y="23" width="30" height="6" rx="2" fill="#d9bd79" stroke="#9b6c16"/><path d="m19 10 7 6-7 7Z" fill="#bd9345"/><circle cx="30" cy="7" r="2" fill="#6e8a74"/></svg>
          <span><strong>验票闸机</strong><small>刷票验证后通行</small></span>
        </div>
        <div className="facility-key-stairs">
          <svg viewBox="0 0 40 32" aria-hidden="true"><path d="M4 6h8v6h8v6h8v7h8" fill="none" stroke="#856a4d" strokeWidth="3"/><path d="m21 5 13 13m-8 0h8v-8" fill="none" stroke="#6e8a74" strokeWidth="2.5"/></svg>
          <span><strong>下楼梯 → 站台</strong><small>闸机后前往入口，下行约 6 秒</small></span>
        </div>
      </div>
    </div>
  );
}
