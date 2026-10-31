import { CanvasTexture, SRGBColorSpace } from "three";

export const SIGN_FACE = { width: 2.65, height: 0.42, panelWidth: 2.8 };

/** Pixel density is identical on both axes, including narrow facility labels. */
export function signCanvasSize(panelWidth: number) {
  const height = 160, surfaceWidth = panelWidth * SIGN_FACE.width / SIGN_FACE.panelWidth;
  return { width: Math.round(height * surfaceWidth / SIGN_FACE.height), height };
}

type SignContext = Pick<CanvasRenderingContext2D, "font" | "fillStyle" | "textAlign" | "textBaseline" | "fillRect" | "measureText" | "fillText">;
export function paintSign(ctx: SignContext, text: string, width: number, height: number) {
  ctx.fillStyle = "#353b38"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f8f5eb"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const maximum = height * 0.64, available = width - height * 0.36;
  const font = (size: number) => `500 ${size}px "Microsoft YaHei", sans-serif`;
  ctx.font = font(maximum);
  const measured = ctx.measureText(text).width;
  ctx.font = font(Math.min(maximum, maximum * available / Math.max(measured, 1)));
  // No maxWidth argument: Canvas must never squash glyphs horizontally.
  ctx.fillText(text, width / 2, height / 2);
}

export function createSignTexture(text: string, panelWidth: number) {
  const canvas = document.createElement("canvas"), size = signCanvasSize(panelWidth);
  canvas.width = size.width; canvas.height = size.height;
  paintSign(canvas.getContext("2d")!, text, size.width, size.height);
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  return map;
}
