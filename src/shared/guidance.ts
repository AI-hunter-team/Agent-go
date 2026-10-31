import { GUIDANCE_MAX_CHARS } from "./types";

/** Limits for each normalized field and its serialized representation. */
export const NORMALIZED_MAX_TEXT_LENGTH = 1000;
export const NORMALIZED_MAX_JSON_LENGTH = 8000;

/** Character count used for the 300-character limit: Unicode code points, so 一个汉字 = 1. */
export function countChars(text: string): number {
  return [...text].length;
}

export function guidanceError(text: unknown): string | null {
  if (typeof text !== "string") return "指导必须是文字";
  if (countChars(text) > GUIDANCE_MAX_CHARS) return `指导不能超过 ${GUIDANCE_MAX_CHARS} 字（当前 ${countChars(text)} 字）`;
  return null;
}
