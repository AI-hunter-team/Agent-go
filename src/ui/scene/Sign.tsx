import { useEffect, useMemo } from "react";
import { CanvasTexture, DoubleSide, SRGBColorSpace } from "three";
import { plane } from "./resources";

/** 绘制真实3D导视面；休息室使用透明底墙面文字，其他站牌保留底色。 */
export function Sign({ text, position, width = 3.8, dark = true, facing = "west", plain = false }: {
  text: string; position: [number, number, number]; width?: number; dark?: boolean; plain?:boolean; facing?: "west" | "east" | "north" | "south";
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = dark ? "#292d2a" : "#c69a44"; if(!plain)ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = plain ? "#142e27" : dark ? "#f5f0e2" : "#292d2a";
    ctx.font = '500 70px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const measured = ctx.measureText(text).width;
    ctx.font = `500 ${Math.min(70, 70 * 960 / Math.max(measured, 1))}px "Microsoft YaHei", sans-serif`;
    if(plain)ctx.font='650 90px "Microsoft YaHei", sans-serif';
    ctx.fillText(text, 512, 96);
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, [text, dark, plain]);
  useEffect(() => () => texture.dispose(), [texture]);
  const angle = facing === "west" ? -Math.PI / 2 : facing === "east" ? Math.PI / 2 : facing === "north" ? Math.PI : 0;
  return <mesh position={position} rotation={[0, angle, 0]} geometry={plane} scale={[width, width * 192 / 1024, 1]}>
    <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} transparent={plain} depthWrite={!plain} />
  </mesh>;
}
