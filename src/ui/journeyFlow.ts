import type { JourneyPreparation } from "../shared/journey";

export type JourneyStage =
  "lobby" | "character" | "guidance" | "planning" | "plan" | "launch" | "watch";
export interface FlowState {
  stage: JourneyStage;
  revision: number;
  prepared: JourneyPreparation | null;
}
export type FlowAction =
  | { type: "navigate"; stage: JourneyStage }
  | { type: "invalidate" }
  | { type: "prepare"; revision: number; prepared: JourneyPreparation };
export const initialFlow: FlowState = {
  stage: "lobby",
  revision: 0,
  prepared: null,
};
/** 返回不清空草稿；依赖改变或离开请求阶段会拒绝旧响应。 */
export function journeyReducer(
  state: FlowState,
  action: FlowAction,
): FlowState {
  if (action.type === "invalidate")
    return {
      ...state,
      revision: state.revision + 1,
      prepared: null,
      stage: ["planning", "plan", "launch"].includes(state.stage)
        ? "guidance"
        : state.stage,
    };
  if (action.type === "prepare")
    return action.revision === state.revision && state.stage === "planning"
      ? { ...state, prepared: action.prepared, stage: "plan" }
      : state;
  return { ...state, stage: action.stage, revision: state.revision + 1 };
}
