import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh, type MeshBasicMaterial } from "three";
import { FACILITIES, QUEUE_SPACING, GATE_BARRIERS, GATE_X, HEIGHT, PILLARS, SECURITY_BARRIERS, SECURITY_X, STAIRS_TOP, STAIRS_BOTTOM, WIDTH, type FacilityDef } from "../../sim/layout";
import type { GameSession } from "../gameSession";
import { box, materials, plane, type colors } from "./resources";

type Color = keyof typeof colors;
function Block({ position, scale, color = "chalk" }: { position: [number, number, number]; scale: [number, number, number]; color?: Color }) {
  return <mesh geometry={box} material={materials[color]} position={position} scale={scale} castShadow receiveShadow />;
}

function Sign({ text, position, width = 3.8, dark = true }: { text: string; position: [number, number, number]; width?: number; dark?: boolean }) {
  const material = useRef<MeshBasicMaterial>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = dark ? "#292d2a" : "#c69a44"; ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = dark ? "#f5f0e2" : "#292d2a";
    ctx.font = '500 70px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(text, 512, 96, 960);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, [text, dark]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={[0, -Math.PI / 2, 0]} geometry={plane} scale={[width, width * 192 / 1024, 1]}>
    <meshBasicMaterial ref={material} map={texture} side={DoubleSide} toneMapped={false} />
  </mesh>;
}

const Device = memo(function Device({ def, session }: { def: FacilityDef; session: GameSession }) {
  const lamp = useRef<Mesh>(null);
  const flap = useRef<Mesh>(null);
  useFrame(() => {
    const state = session.presentation.current.facilities.find((f) => f.id === def.id);
    if (lamp.current) lamp.current.material = state?.status === "open" ? materials.sage : state?.status === "broken" ? materials.brick : materials.grey;
    if (flap.current) flap.current.rotation.y = state?.serving ? -Math.PI / 2 : 0;
  });
  const [x, z] = [def.pos.x, def.pos.y];
  return <group>
    {def.kind === "tvm" ? <>
      <Block position={[x, 0.82, z]} scale={[0.35, 1.64, 0.82]} color="ink" />
      <Block position={[x - 0.185, 1.15, z]} scale={[0.025, 0.46, 0.6]} color="screen" />
      <Block position={[x - 0.2, 0.63, z]} scale={[0.03, 0.06, 0.28]} color="ochre" />
    </> : def.kind === "security" ? <>
      {[-0.88, 0.88].map((offset) => <Block key={offset} position={[x, 1.25, z + offset]} scale={[0.42, 2.5, 0.22]} color="ink" />)}
      <Block position={[x, 2.43, z]} scale={[0.42, 0.18, 1.9]} color="ink" />
      <Block position={[x - 0.18, 0.48, z + 0.8]} scale={[1.4, 0.12, 0.5]} color="sage" />
    </> : <>
      {[-0.49, 0.49].map((offset) => <Block key={offset} position={[x, 0.53, z + offset]} scale={[1.05, 1.06, 0.2]} color="ink" />)}
      <mesh ref={flap} geometry={box} material={materials.sage} position={[x, 0.7, z]} scale={[0.08, 0.45, 0.8]} castShadow />
      <Block position={[x - 0.35, 1.085, z - 0.49]} scale={[0.2, 0.04, 0.12]} color="ochre" />
    </>}
    <mesh ref={lamp} geometry={box} material={materials.sage} position={[x - 0.23, def.kind === "security" ? 2.5 : 1.75, z]} scale={[0.08, 0.08, 0.45]} />
    <Sign text={def.id} position={[x - 0.12, def.kind === "security" ? 2.95 : 2.3, z]} width={1.3} />
    {Array.from({ length: 6 }, (_, index) => <mesh key={index} geometry={box} material={materials.line} position={[def.head.x - index * QUEUE_SPACING, 0.006, z]} scale={[0.03, 0.01, 0.4]} receiveShadow />)}
  </group>;
});

export const StationFallback = memo(function StationFallback({ session }: { session: GameSession }) {
  return <group>
    <Block position={[STAIRS_TOP.x / 2, -0.09, HEIGHT / 2]} scale={[STAIRS_TOP.x, 0.18, HEIGHT + 2]} color="chalk" />
    <Block position={[(STAIRS_BOTTOM.x + WIDTH) / 2, -2.09, HEIGHT / 2]} scale={[WIDTH - STAIRS_BOTTOM.x + 2, 0.18, HEIGHT + 2]} color="sage" />
    {Array.from({ length: 12 }, (_, index) => {
      const width = (STAIRS_BOTTOM.x - STAIRS_TOP.x) / 12;
      const top = -2 * index / 12;
      return <Block key={`stairs${index}`} position={[STAIRS_TOP.x + width * (index + 0.5), top - 0.1, STAIRS_TOP.y]} scale={[width, 0.2, 4]} color={index % 2 ? "chalk" : "ochre"} />;
    })}
    <Sign text="04   下楼梯 / PLATFORM  ↓" position={[47.5, 2.8, 15]} width={5.8} />
    <Block position={[(SECURITY_X + GATE_X) / 2, -0.015, HEIGHT / 2]} scale={[GATE_X - SECURITY_X, 0.025, HEIGHT]} color="white" />
    <Block position={[(GATE_X + STAIRS_TOP.x) / 2, -0.012, HEIGHT / 2]} scale={[STAIRS_TOP.x - GATE_X, 0.025, HEIGHT]} color="sage" />
    {Array.from({ length: Math.floor(STAIRS_TOP.x / 3) + 1 }, (_, i) => <mesh key={`x${i}`} geometry={box} material={materials.line} position={[i * 3, 0.002, HEIGHT / 2]} scale={[0.015, 0.005, HEIGHT]} />)}
    {Array.from({ length: 11 }, (_, i) => <mesh key={`z${i}`} geometry={box} material={materials.line} position={[STAIRS_TOP.x / 2, 0.003, i * 3]} scale={[STAIRS_TOP.x, 0.005, 0.015]} />)}
    {[...SECURITY_BARRIERS, ...GATE_BARRIERS].map((r, i) => <group key={`rail${i}`}><Block position={[r.x + r.w / 2, 1.065, r.y + r.h / 2]} scale={[0.065, 0.065, r.h]} color="grey" />{Array.from({ length: Math.ceil(r.h / 0.3) }, (_, j) => <Block key={j} position={[r.x + r.w / 2, 0.55, r.y + 0.08 + j * (r.h - 0.16) / Math.max(1, Math.ceil(r.h / 0.3) - 1)]} scale={[0.035, 1.1, 0.035]} color="grey" />)}</group>)}
    {PILLARS.map((r, i) => <group key={`pillar${i}`}>
      <Block position={[r.x + r.w / 2, 1.75, r.y + r.h / 2]} scale={[r.w, 3.5, r.h]} color="chalk" />
      <Block position={[r.x + r.w / 2 - 0.01, 0.12, r.y + r.h / 2]} scale={[r.w + 0.04, 0.24, r.h + 0.04]} color="ink" />
    </group>)}
    {[0, HEIGHT].map((z) => <group key={z}>
      <Block position={[WIDTH / 2, 1.75, z === 0 ? -0.3 : HEIGHT + 0.3]} scale={[WIDTH, 3.5, 0.4]} color="white" />
      <Block position={[WIDTH / 2, 0.16, z === 0 ? -0.07 : HEIGHT + 0.07]} scale={[WIDTH, 0.3, 0.05]} color="ink" />
      {[6, 18, 30, 42, 54].map((x) => <Block key={x} position={[x, 1.8, z === 0 ? -0.05 : HEIGHT + 0.05]} scale={[0.3, 3.6, 0.3]} color="grey" />)}
    </group>)}
    <Sign text="01   购票 / TICKETS  →" position={[10.8, 3.15, 15]} width={6.2} />
    <Sign text="02   安检 / SECURITY  →" position={[24, 3.25, 15]} width={5.5} />
    <Sign text="03   进站 / DEPARTURES  →" position={[42, 3.2, 15]} width={5.8} />
    <Sign text="下一程，由你决定" position={[65, 0.5, 15]} width={6} dark={false} />
    {FACILITIES.map((def) => <Device key={def.id} def={def} session={session} />)}
    {[7, 20, 31, 39].map((x) => <group key={`arrow${x}`} position={[x, 0.012, 15]}>
      <mesh geometry={box} material={materials.ochre} scale={[0.9, 0.008, 0.06]} />
      {[-1, 1].map((side) => <mesh key={side} geometry={box} material={materials.ochre} position={[0.3, 0, side * 0.13]} rotation={[0, side * Math.PI / 4, 0]} scale={[0.4, 0.008, 0.06]} />)}
    </group>)}
  </group>;
});
