import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import type { SavedWorld } from "./worldLibrary";
import styles from "./ControlRoom.module.css";
import { BrandMark } from "./BrandMark";
interface Props {
  worlds:SavedWorld[];loaded:boolean;storageError:string;selectedName?:string;
  onAppearance:()=>void;onCreate:()=>void;onSelect:(world:SavedWorld)=>void;onContinue:()=>void;
  onRename:(world:SavedWorld,name:string)=>void;onDelete:(id:string)=>void;
}
/** 首页保留世界与外观流程，联机与排行榜为路演占位入口。 */
export function ControlRoomMenu(p:Props){
  const lastFocus=useRef<HTMLElement|null>(null);
  const [list,setList]=useState(false),[edit,setEdit]=useState<{world:SavedWorld;mode:"rename"|"delete"}|null>(null),[name,setName]=useState("");
  return <>
    <div className={styles.homeVeil} aria-hidden="true"/>
    <BrandMark className={styles.homeBrand}/>
    <nav className={styles.welcome} aria-label="出发休息室">
      <button className="primary" disabled={!p.loaded} onClick={p.onCreate}><span>创建世界</span><img src="/assets/icons/arrow-forward.svg" alt="" width="40" height="40"/></button>
      <button type="button"><span>联机大厅</span></button>
      <button type="button"><span>排行榜</span></button>
      <button aria-label="我的世界" onClick={()=>setList(true)}><span>我的世界</span>{p.worlds.length>0&&<small>{p.worlds.length}</small>}</button>
      <button onClick={p.onAppearance}><span>角色外观</span></button>
      {p.storageError&&<p role="status" className={styles.storageNotice}>{p.storageError}</p>}
    </nav>
    <Dialog.Root open={list} onOpenChange={setList}><Dialog.Portal><Dialog.Overlay className={styles.workspaceShade}/><Dialog.Content className={styles.worldManager} aria-describedby={undefined}><span className={styles.kicker}>LOCAL WORLDS</span><Dialog.Title>我的世界</Dialog.Title><p className={styles.hint}>保存于当前浏览器；每次进入都从新的旅程开始。</p>
      {p.selectedName&&<button className={styles.continueWorld} onClick={()=>{setList(false);p.onContinue();}}>继续准备：{p.selectedName}</button>}
      <button className="primary full-width" onClick={p.onCreate}>＋ 创建新世界</button>
      {!p.loaded?<p role="status">正在读取世界…</p>:!p.worlds.length?<p>还没有世界。先创建第一座车站。</p>:<div className={styles.worldList}>{p.worlds.map(world=><article key={world.id} className={styles.worldCard}>
        <button className={styles.selectWorld} onClick={()=>{setList(false);p.onSelect(world);}}><strong>{world.name}</strong><span>种子 · {world.source.value}</span><small>{world.world.generatorVersion} · {new Date(world.updatedAt).toLocaleDateString("zh-CN")}</small></button>
        <div className="row"><button aria-label={`重命名 ${world.name}`} onClick={event=>{lastFocus.current=event.currentTarget;setEdit({world,mode:"rename"});setName(world.name);}}>重命名</button><button aria-label={`删除 ${world.name}`} onClick={event=>{lastFocus.current=event.currentTarget;setEdit({world,mode:"delete"});}}>删除</button></div>
      </article>)}</div>}
      <button className="ghost full-width" onClick={()=>setList(false)}>返回休息室</button>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!edit} onOpenChange={open=>{if(!open)setEdit(null);}}><Dialog.Portal><Dialog.Overlay className={styles.modalShade}/>{edit&&<Dialog.Content className={styles.modal} onCloseAutoFocus={event=>{event.preventDefault();lastFocus.current?.focus();}}>
      <Dialog.Title>{edit.mode==="rename"?"重命名世界":`删除“${edit.world.name}”？`}</Dialog.Title><Dialog.Description className={styles.hint}>管理保存在当前浏览器中的世界记录。</Dialog.Description>
      {edit.mode==="rename"?<input autoFocus aria-label="新的世界名称" maxLength={48} value={name} onChange={e=>setName(e.target.value)}/>:<p>本机记录将被删除；已导出的对局报告仍然可用。</p>}
      <div className="row"><button className="primary" disabled={edit.mode==="rename"&&!name.trim()} onClick={()=>{if(edit.mode==="rename")p.onRename(edit.world,name);else p.onDelete(edit.world.id);setEdit(null);}}>确认{edit.mode==="rename"?"重命名":"删除"}</button><button onClick={()=>setEdit(null)}>取消</button></div>
    </Dialog.Content>}</Dialog.Portal></Dialog.Root>
  </>;
}
