import type { Rect } from "../sim/geometry";
import type { StationWall,FloorId } from "./world";
const inside=(r:Rect,x:number,y:number)=>x>r.x-1e-6&&x<r.x+r.w+1e-6&&y>r.y-1e-6&&y<r.y+r.h+1e-6;
export function subtractRect(r:Rect,h:Rect):Rect[]{
 const x0=Math.max(r.x,h.x),x1=Math.min(r.x+r.w,h.x+h.w),y0=Math.max(r.y,h.y),y1=Math.min(r.y+r.h,h.y+h.h);
 if(x0>=x1||y0>=y1)return [r];
 return [{...r,w:x0-r.x},{...r,x:x1,w:r.x+r.w-x1},{...r,x:x0,y:r.y,w:x1-x0,h:y0-r.y},{...r,x:x0,y:y1,w:x1-x0,h:r.y+r.h-y1}].filter(v=>v.w>1e-6&&v.h>1e-6);
}
/** Disjoint rectangular partition; shared by floors, void collision and map paint. */
export function rectangularUnion(rects:readonly Rect[]):Rect[]{
 const out:Rect[]=[];
 for(const r of rects){let pieces=[r];for(const old of out)pieces=pieces.flatMap(p=>subtractRect(p,old));out.push(...pieces);}
 return out;
}
export function withoutRooms(rects:readonly Rect[],rooms:readonly Rect[]):Rect[]{
 let out=rectangularUnion(rects);for(const room of rooms)out=out.flatMap(r=>subtractRect(r,room));return out;
}
export function coversRect(rect:Rect,areas:readonly Rect[]):boolean{
 const area=areas.reduce((sum,r)=>sum+Math.max(0,Math.min(rect.x+rect.w,r.x+r.w)-Math.max(rect.x,r.x))*Math.max(0,Math.min(rect.y+rect.h,r.y+r.h)-Math.max(rect.y,r.y)),0);
 return area>=rect.w*rect.h-1e-5;
}
/** Union boundary, with internal edges removed and collinear runs merged. */
export function footprintWalls(rects:readonly Rect[],floorId:FloorId,height:number):StationWall[]{
 const xs=[...new Set(rects.flatMap(r=>[r.x,r.x+r.w]))].sort((a,b)=>a-b),ys=[...new Set(rects.flatMap(r=>[r.y,r.y+r.h]))].sort((a,b)=>a-b);
 const filled=(i:number,j:number)=>i>=0&&j>=0&&i<xs.length-1&&j<ys.length-1&&rects.some(r=>inside(r,(xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2));
 const lines=new Map<string,{side:StationWall["side"];at:number;spans:[number,number][]}>();
 const edge=(side:StationWall["side"],at:number,a:number,b:number)=>{const key=side+":"+at;let row=lines.get(key);if(!row){row={side,at,spans:[]};lines.set(key,row);}row.spans.push([a,b]);};
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++)if(filled(i,j)){
  if(!filled(i,j-1))edge("north",ys[j],xs[i],xs[i+1]);if(!filled(i,j+1))edge("south",ys[j+1],xs[i],xs[i+1]);
  if(!filled(i-1,j))edge("west",xs[i],ys[j],ys[j+1]);if(!filled(i+1,j))edge("east",xs[i+1],ys[j],ys[j+1]);
 }
 const walls:StationWall[]=[];
 for(const {side,at,spans} of lines.values()){
  spans.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];
  for(const span of spans){const last=merged.at(-1);if(last&&Math.abs(last[1]-span[0])<1e-6)last[1]=span[1];else merged.push([...span]);}
  for(const [a,b] of merged){const horizontal=side==="north"||side==="south";walls.push({id:`wall-${floorId}-${walls.length}`,floorId,side,height,from:{x:horizontal?a:at,y:horizontal?at:a,floorId},to:{x:horizontal?b:at,y:horizontal?at:b,floorId}});}
 }
 return walls;
}
export function cutWallApertures(walls:StationWall[],doors:readonly {foot:{x:number;y:number};width:number}[]):StationWall[]{
 return walls.flatMap(w=>{const horizontal=w.from.y===w.to.y,at=horizontal?w.from.y:w.from.x;
  let spans:[[number,number]]|[number,number][]=[[horizontal?w.from.x:w.from.y,horizontal?w.to.x:w.to.y]];
  for(const door of doors){if(Math.abs((horizontal?door.foot.y:door.foot.x)-at)>.01)continue;const c=horizontal?door.foot.x:door.foot.y,a=c-door.width/2,b=c+door.width/2;
   spans=spans.flatMap(([lo,hi])=>a>=hi||b<=lo?[[lo,hi] as [number,number]]:[[lo,Math.max(lo,a)],[Math.min(hi,b),hi]].filter(s=>s[1]-s[0]>1e-6) as [number,number][]);
  }
  return spans.map(([a,b],i)=>({...w,id:w.id+":"+i,from:{...w.from,x:horizontal?a:at,y:horizontal?at:a},to:{...w.to,x:horizontal?b:at,y:horizontal?at:b}}));
 });
}
