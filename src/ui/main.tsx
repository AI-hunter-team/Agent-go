import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Engine } from "../sim/engine";
import { MapCanvas } from "./MapCanvas";
import type { RenderOptions } from "./render";

function Preview() {
  const engineRef = useRef<Engine | null>(new Engine(1));
  const optionsRef = useRef<RenderOptions>({ showVision: true, showTrail: false, thinking: false });
  return <MapCanvas engineRef={engineRef} optionsRef={optionsRef} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
