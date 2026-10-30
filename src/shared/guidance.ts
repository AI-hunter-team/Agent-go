import { GUIDANCE_MAX_CHARS } from "./types";

/** Character count used for the 300-character limit: Unicode code points, so 一个汉字 = 1. */
export function countChars(text: string): number {
  return [...text].length;
}

export function guidanceError(text: unknown): string | null {
  if (typeof text !== "string") return "指导必须是文字";
  if (countChars(text) > GUIDANCE_MAX_CHARS) return `指导不能超过 ${GUIDANCE_MAX_CHARS} 字（当前 ${countChars(text)} 字）`;
  return null;
}
