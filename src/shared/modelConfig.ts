/** 页面和服务端共同接受的思考档位；档位不表示精确 token 数。 */
export const REASONING_EFFORTS = ["none", "low", "high", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

/** 验证外部输入，拒绝未知档位而不是静默降档。 */
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && REASONING_EFFORTS.some((effort) => effort === value);
}
