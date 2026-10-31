import { useCallback, useEffect, useState } from "react";
import type { GameSettings } from "../shared/gameSettings";
import { gameSettingsError } from "../shared/gameSettings";
import type { CreatedWorld } from "./worldCreation";
import { resolveWorldSeed } from "./worldCreation";

export interface WorldPreferences {
  settings: GameSettings; backpack: boolean; characterId: string;
  kind: "llm" | "offline"; guidance: string;
}
export interface SavedWorld extends CreatedWorld {
  schemaVersion: 1; id: string; createdAt: number; updatedAt: number;
  preferences: WorldPreferences;
}
export function isSavedWorld(value: unknown): value is SavedWorld {
  if (!value || typeof value !== "object") return false;
  const v=value as SavedWorld, p=v.preferences;
  const seed=typeof v.source?.value==="string"?resolveWorldSeed(v.source.value):null;
  return v.schemaVersion===1 && typeof v.id==="string" && v.id.length>0 && typeof v.name==="string" && v.name.length<=48
    && !!seed?.ok && seed.seed===v.seed && ["random","custom"].includes(v.source.mode)
    && typeof v.world?.generatorVersion==="string" && typeof v.world.layoutHash==="string"
    && Number.isFinite(v.createdAt) && Number.isFinite(v.updatedAt) && !!p && !!p.settings && !gameSettingsError(p.settings)
    && p.settings.extraQueuePeople===3 && typeof p.backpack==="boolean" && ["dafeiyu","naiwa","custom"].includes(p.characterId)
    && ["llm","offline"].includes(p.kind) && typeof p.guidance==="string" && Array.from(p.guidance).length<=1200;
}
/** Separate database: existing imported-avatar blobs never migrate or get overwritten here. */
export function worldStore(operation:"list"):Promise<SavedWorld[]>;
export function worldStore(operation:"put",value:SavedWorld):Promise<void>;
export function worldStore(operation:"delete",value:string):Promise<void>;
export function worldStore(operation:"list"|"put"|"delete",value?:SavedWorld|string):Promise<SavedWorld[]|void>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){reject(new Error("本机世界存储不可用，本次仍可游玩。"));return;}
    const request=indexedDB.open("agent-go-worlds",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("worlds",{keyPath:"id"});
    request.onerror=()=>reject(request.error??new Error("无法读取本机世界。"));
    request.onblocked=()=>reject(new Error("世界存储被旧页面占用，请关闭旧页面后重试。"));
    request.onsuccess=()=>{
      const db=request.result;db.onversionchange=()=>db.close();
      try{
        const tx=db.transaction("worlds",operation==="list"?"readonly":"readwrite"),store=tx.objectStore("worlds");
        const query=operation==="list"?store.getAll():operation==="put"?store.put(value):store.delete(value as string);
        tx.oncomplete=()=>{db.close();resolve(operation==="list"?(query.result as unknown[]).filter(isSavedWorld).sort((a,b)=>b.updatedAt-a.updatedAt):undefined);};
        tx.onabort=()=>{db.close();reject(tx.error??new Error("世界未保存，本次仍可游玩。"));};
        tx.onerror=()=>{db.close();reject(tx.error??new Error("世界存储失败。"));};
      }catch(error){db.close();reject(error);}
    };
  });
}
export function useWorldLibrary(){
  const [worlds,setWorlds]=useState<SavedWorld[]>([]),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState("");
  useEffect(()=>{let active=true;worldStore("list").then(value=>{if(active)setWorlds(current=>[...new Map([...value,...current].map(w=>[w.id,w])).values()].sort((a,b)=>b.updatedAt-a.updatedAt));}).catch(()=>{if(active)setStorageError("无法读取本机世界；本次创建的世界仅在当前页面保留。");}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
  const save=useCallback((world:SavedWorld)=>{
    setWorlds(old=>[world,...old.filter(w=>w.id!==world.id)].sort((a,b)=>b.updatedAt-a.updatedAt));
    void worldStore("put",world).catch(()=>setStorageError("世界未能保存到本机；当前页面仍可继续游玩。"));
  },[]);
  const remove=useCallback((id:string)=>{setWorlds(old=>old.filter(w=>w.id!==id));void worldStore("delete",id).catch(()=>setStorageError("本机删除失败，刷新后该世界可能再次出现。"));},[]);
  return {worlds,loaded,storageError,save,remove};
}
