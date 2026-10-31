import type { WorldDefinition, WorldDescriptor } from "../shared/world";

export interface WorldSeedSource { mode: "random" | "custom"; value: string; }
export interface CreatedWorld {
  id?: string;
  seed: number;
  name: string;
  source: WorldSeedSource;
  world: WorldDescriptor;
}
export type SeedResolution = { ok:true; seed:number; normalized:string; kind:"number"|"text" } | { ok:false; error:string };
/** Numeric seeds retain the existing API value. Text uses fixed NFC + UTF-8 FNV-1a. */
export function resolveWorldSeed(raw:string):SeedResolution{
  const normalized=raw.trim().normalize("NFC");
  if(!normalized)return {ok:false,error:"输入一个数字或文字种子，预览会自动更新。"};
  if(Array.from(normalized).length>64)return {ok:false,error:"种子最多支持64个字符。"};
  if(/^[+-]?\d+(?:\.\d+)?$/.test(normalized)){
    const seed=Number(normalized);
    return Number.isInteger(seed)&&seed>=1&&seed<=4294967295?{ok:true,seed,normalized,kind:"number"}:{ok:false,error:"数字种子需要是1～4294967295之间的整数。"};
  }
  let hash=2166136261;for(const byte of new TextEncoder().encode(normalized))hash=Math.imul(hash^byte,16777619);
  return {ok:true,seed:(hash>>>0)||1,normalized,kind:"text"};
}
export function createdWorld(definition:WorldDefinition,source:WorldSeedSource,name=definition.name):CreatedWorld{
  const resolved=resolveWorldSeed(source.value);
  if(!resolved.ok)throw new Error(resolved.error);
  if(!["metro-v1","metro-v2"].includes(definition.generatorVersion)||resolved.seed!==definition.seed||(source.mode==="random"&&resolved.kind!=="number"))throw new Error("地图预览已变化，请等待新的预览完成。");
  return {seed:definition.seed,name:name.trim().slice(0,48)||definition.name,source:{...source},world:{generatorVersion:definition.generatorVersion,layoutHash:definition.layoutHash}};
}
export function matchesCreatedWorld(choice:CreatedWorld|null,definition:WorldDefinition):boolean{
  return !!choice&&choice.seed===definition.seed&&choice.world.generatorVersion===definition.generatorVersion&&choice.world.layoutHash===definition.layoutHash;
}
