import type { PassengerKind } from "../../shared/types";

export type CrowdKind = Exclude<PassengerKind, "player">;

/** 用户色卡：衣物主色与配件色分开，避免人群全部使用同一种灰色。 */
export const passengerPalette = {
  emerald: "#088e51", leaf: "#7fd371", lemon: "#ffe103", lime: "#bcff4f",
  rose: "#f88395", blush: "#ffc4c3", blue: "#87c0e4", ice: "#c0ecff",
  chestnut: "#7a4920", caramel: "#ac7a53", olive: "#645e2a", sage: "#8d9057",
  wine: "#7c0406", berry: "#bd4a4c", orange: "#df5b18", apricot: "#f1a864",
} as const;

type PaletteColor = keyof typeof passengerPalette;
const outfits: Record<CrowdKind, readonly (readonly [PaletteColor, PaletteColor])[]> = {
  normal: [["blue", "ice"], ["rose", "blush"], ["leaf", "emerald"], ["apricot", "chestnut"]],
  elderly: [["sage", "blush"], ["caramel", "ice"], ["berry", "apricot"], ["olive", "leaf"]],
  luggage: [["emerald", "leaf"], ["blue", "ice"], ["rose", "blush"], ["caramel", "apricot"]],
  hurried: [["rose", "blush"], ["emerald", "lime"], ["blue", "ice"], ["orange", "apricot"]],
};

/** 男女各四款结构造型，颜色不承担性别识别；行为类别不限制性别。 */
export const passengerStyles = [
  { gender: "male", hairStyle: "sidePart", outfit: "shirt", height: 1.00, width: 1.00 },
  { gender: "male", hairStyle: "curls", outfit: "hoodie", height: 0.97, width: 1.00 },
  { gender: "male", hairStyle: "quiff", outfit: "blazer", height: 1.01, width: 0.97 },
  { gender: "male", hairStyle: "crop", outfit: "vest", height: 0.99, width: 1.00 },
  { gender: "female", hairStyle: "bob", outfit: "cardigan", height: 0.97, width: 0.96 },
  { gender: "female", hairStyle: "ponytail", outfit: "hoodie", height: 0.99, width: 0.95 },
  { gender: "female", hairStyle: "bun", outfit: "coat", height: 1.00, width: 0.96 },
  { gender: "female", hairStyle: "waves", outfit: "dress", height: 0.98, width: 0.95 },
] as const;

/** 整体散列后选 8 种轮廓 × 4 种配色；不消耗世界随机数。 */
export function passengerAppearance(kind: CrowdKind, id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  const variant = ((hash ^ (hash >>> 16)) >>> 0) % 32;
  const style = variant % 8, colorway = Math.floor(variant / 8);
  const profile = passengerStyles[style];
  const [coat, accent] = outfits[kind][colorway];
  return {
    ...profile, variant, style, colorway,
    skirt: profile.outfit === "cardigan" || profile.outfit === "dress",
    glasses: kind === "elderly" || style === 2 || (style === 6 && colorway % 2 === 0),
    coat: passengerPalette[coat], accent: passengerPalette[accent],
    skin: ["#fff0df", "#f5dbc4", "#e9c3a6", "#ffead7"][(colorway + style) % 4],
    hair: kind === "elderly" ? ["#d8d4c9", "#a6a49f", "#e7e2d6", "#b3a79c"][colorway] : ["#49382e", "#7a4920", "#302f34", "#ac7a53"][(colorway + style) % 4],
    trousers: ["#384b58", "#51444a", "#42564c", "#554a3d"][colorway],
  };
}
