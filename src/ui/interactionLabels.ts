import type { WorldEventKind } from "../shared/interaction";
export const EVENT_LABEL: Record<WorldEventKind, string> = {
 item_dropped: "丢物", item_thrown: "投掷", collision: "碰撞", push: "推搡", snatch: "抢夺", strike: "击打", knockout: "击晕", threaten: "威胁", vault: "翻越", slide_handrail: "滑扶手", escalator_exit: "翻出扶梯", force_cut_in: "强行插队", argument: "争执", report: "报告保安", facility_damaged: "设施损坏", power_out: "断电", power_restored: "恢复供电", odd_behaviour: "异常动静"
};
export const LEVEL_LABEL: Record<string, string> = { none: "无", white: "白色", yellow: "黄色", red: "红色" };
