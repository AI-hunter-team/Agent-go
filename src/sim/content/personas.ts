import type { Persona } from "../../shared/interaction";

export interface PersonalityProfile { id: string; label: string; traits: Persona["traits"]; hurry: number; fatigue: number }
/** Defaults for the real world generator as well as the laboratory controls. */
export const PERSONALITY_PROFILES: readonly PersonalityProfile[] = [
  { id: "helpful", label: "温和热心", traits: { courage: .45, vanity: .45, temper: .08, fairness: .55, meddling: .4 }, hurry: .12, fatigue: .2 },
  { id: "timid", label: "胆小避事", traits: { courage: .08, vanity: .3, temper: .1, fairness: .3, meddling: .06 }, hurry: .45, fatigue: .5 },
  { id: "tough", label: "强硬暴躁", traits: { courage: .94, vanity: .25, temper: .94, fairness: .75, meddling: .6 }, hurry: .6, fatigue: .3 },
  { id: "fair", label: "重视公平", traits: { courage: .8, vanity: .1, temper: .4, fairness: .96, meddling: .92 }, hurry: .4, fatigue: .35 },
  { id: "vain", label: "爱面子", traits: { courage: .5, vanity: .96, temper: .3, fairness: .4, meddling: .25 }, hurry: .2, fatigue: .25 },
  { id: "flexible", label: "随和灵活", traits: { courage: .55, vanity: .55, temper: .18, fairness: .12, meddling: .12 }, hurry: .3, fatigue: .4 },
  { id: "hurried", label: "急切冷淡", traits: { courage: .65, vanity: .15, temper: .72, fairness: .65, meddling: .2 }, hurry: .94, fatigue: .7 },
];

export const LOOKS = {
  build: ["身形匀称", "肩背挺直", "个子高挑", "身材结实", "身形清瘦", "体型圆润", "步幅轻巧", "动作沉稳"],
  outfit: ["深蓝夹克", "赭色外套", "米白衬衫", "灰色风衣", "墨绿针织衫", "砖红卫衣", "浅褐西装", "黑色运动服"],
  manner: ["不时望向指示牌", "安静地整理衣袖", "站姿放松", "握着随身物品", "侧身给人让路", "仔细查看时钟", "轻轻踱步", "沿着地面标线站立"],
  voice: ["语气简洁", "声音轻缓", "说话清晰", "语速较快", "用词谨慎", "声音低沉", "语调平稳", "表达直率"],
} as const;
