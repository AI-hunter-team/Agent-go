import { useEffect, useMemo } from "react";
import { CanvasTexture, DoubleSide, SRGBColorSpace } from "three";
import { plane } from "./resources";

export function Sign({ text, position, width = 3.8, dark = true, facing = "west" }: {
  text: string; position: [number, number, number]; width?: number; dark?: boolean; facing?: "west" | "north" | "south";
}) {
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
  const angle = facing === "west" ? -Math.PI / 2 : facing === "north" ? Math.PI : 0;
  return <mesh position={position} rotation={[0, angle, 0]} geometry={plane} scale={[width, width * 192 / 1024, 1]}>
    <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
  </mesh>;
}
