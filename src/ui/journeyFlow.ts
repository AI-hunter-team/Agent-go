import type { CreatedWorld } from "./worldCreation";
import type { JourneyPreparation } from "../shared/journey";

export type JourneyStage =
  "lobby" | "world" | "character" | "guidance" | "planning" | "plan" | "launch" | "watch";
export interface FlowState {
  stage: JourneyStage;
  characterEntry:"lobby"|"journey";
  createdWorld: CreatedWorld | null;
  revision: number;
  prepared: JourneyPreparation | null;
}
export type FlowAction =
  | { type: "navigate"; stage: JourneyStage;characterEntry?:"lobby"|"journey" }
  | { type: "invalidate" }
  | { type: "world-selected"; choice: CreatedWorld }
  | { type: "world-removed" }
  | { type: "world-renamed"; name: string }
  | { type: "world-created"; choice: CreatedWorld }
  | { type: "prepare"; revision: number; prepared: JourneyPreparation };
export const initialFlow: FlowState = {
  stage: "lobby",
  characterEntry:"journey",
  createdWorld: null,
  revision: 0,
  prepared: null,
};
/** 返回不清空草稿；依赖改变或离开请求阶段会拒绝旧响应。 */
export function journeyReducer(
  state: FlowState,
  action: FlowAction,
): FlowState {
  if(action.type === "world-selected") return {...state, stage:"character", characterEntry:"journey", createdWorld:action.choice, prepared:null, revision:state.revision+1};
  if(action.type === "world-removed") return {...initialFlow,revision:state.revision+1};
  if(action.type === "world-renamed") return {...state,createdWorld:state.createdWorld?{...state.createdWorld,name:action.name}:null};
  if(action.type === "world-created") return state.stage === "world" ? {...state,stage:"character",characterEntry:"journey",createdWorld:action.choice,prepared:null,revision:state.revision+1} : state;
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
  const appearance=action.stage==="character"&&action.characterEntry==="lobby";
  const stage=action.stage!=="lobby"&&action.stage!=="world"&&!appearance&&!state.createdWorld?"world":action.stage;
  return { ...state, stage,characterEntry:action.characterEntry??state.characterEntry, prepared:stage==="world"?null:state.prepared, revision: state.revision + 1 };
}
