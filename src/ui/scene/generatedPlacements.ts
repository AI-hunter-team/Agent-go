import type { WorldDefinition } from "../../shared/world";
import type { Rect } from "../../sim/geometry";
import type { Placement } from "./stationLayout";

function subtract(r:Rect,h:Rect):Rect[] {
  const x0=Math.max(r.x,h.x),x1=Math.min(r.x+r.w,h.x+h.w),y0=Math.max(r.y,h.y),y1=Math.min(r.y+r.h,h.y+h.h);
  if(x0>=x1||y0>=y1)return [r];
  return [{x:r.x,y:r.y,w:x0-r.x,h:r.h},{x:x1,y:r.y,w:r.x+r.w-x1,h:r.h},{x:x0,y:r.y,w:x1-x0,h:y0-r.y},{x:x0,y:y1,w:x1-x0,h:r.y+r.h-y1}].filter(r=>r.w>.001&&r.h>.001);
}
/** Shared by the live generated station and the standalone asset showroom. */
export function generatedStationPlacements(d: WorldDefinition, overview: boolean): Placement[] {
  const l=d.layout;

    const out:Placement[]=[];
    const add=(id:string,x:number,y:number,z:number,scale:[number,number,number]=[1,1,1],yaw=0)=>out.push({id,position:[x,y,z],yaw,scale});
    for(let x=0;x<l.WIDTH;x+=3)for(let z=0;z<l.HEIGHT;z+=3){let pieces:Rect[]=[{x,y:z,w:Math.min(3,l.WIDTH-x),h:Math.min(3,l.HEIGHT-z)}];for(const hole of l.openings??[])pieces=pieces.flatMap(r=>subtract(r,hole));for(const r of pieces)add("floor-sage",r.x+r.w/2,0,r.y+r.h/2,[r.w/3,1,r.h/3]);}
    const wall=(alongX:boolean,at:number,length:number)=>{
      const doors=(d.entrances??[]).filter(e=>Math.abs((alongX?e.foot.y:e.foot.x)-at)<.01).map(e=>({start:(alongX?e.foot.x:e.foot.y)-e.width/2,end:(alongX?e.foot.x:e.foot.y)+e.width/2}));
      for(let start=0;start<length;start+=3){
        const end=Math.min(length,start+3);let spans=[{start,end}];
        for(const door of doors)spans=spans.flatMap(s=>door.end<=s.start||door.start>=s.end?[s]:[{start:s.start,end:Math.max(s.start,door.start)},{start:Math.min(s.end,door.end),end:s.end}]).filter(s=>s.end-s.start>.01);
        for(const span of spans){const center=(span.start+span.end)/2;add("wall-straight",alongX?center:at,0,alongX?at:center,[(span.end-span.start)/3,1,1],alongX?0:Math.PI/2);}
        add("ceiling-fascia",alongX?(start+end)/2:at,3.5,alongX?at:(start+end)/2,[(end-start)/3,1,1],alongX?0:Math.PI/2);
      }
    };
    if(d.entrances?.length){for(const at of [0,l.HEIGHT])wall(true,at,l.WIDTH);for(const at of [0,l.WIDTH])wall(false,at,l.HEIGHT);}
    else {
      for(let x=0;x<l.WIDTH;x+=3)for(const z of [0,l.HEIGHT]){const entrance=l.NAV_NODES.filter(n=>n.id.startsWith("ENTRANCE")).some(n=>Math.abs(n.pos.y-z)<3&&Math.abs(n.pos.x-(x+1.5))<2.4);if(!entrance){add("wall-straight",x+1.5,0,z);add("ceiling-fascia",x+1.5,3.5,z);}}
      for(let z=0;z<l.HEIGHT;z+=3)for(const x of [0,l.WIDTH])if(!l.NAV_NODES.filter(n=>n.id.startsWith("ENTRANCE")).some(n=>Math.abs(n.pos.x-x)<3&&Math.abs(n.pos.y-(z+1.5))<2.4))add("wall-straight",x,0,z+1.5,[1,1,1],Math.PI/2);
    }
    for(const r of [...l.SECURITY_BARRIERS,...l.GATE_BARRIERS])out.push({id:"metal-straight",position:[r.x+r.w/2,0,r.y+r.h/2],yaw:r.w>r.h?0:-Math.PI/2,scale:[1,1,1],railLength:Math.max(r.w,r.h)});
    for(const [top,bottom] of [[l.STAIRS_TOP,l.STAIRS_BOTTOM],[l.ESCALATOR_TOP,l.ESCALATOR_BOTTOM]]) {
      const run=Math.hypot(bottom.x-top.x,bottom.y-top.y),dx=(bottom.x-top.x)/run,dz=(bottom.y-top.y)/run,yaw=-Math.atan2(dz,dx),span=run+1.3;
      for(const sign of [-1,1])out.push({id:"metal-straight",position:[top.x+dx*(span/2-.1)-dz*1.3*sign,0,top.y+dz*(span/2-.1)+dx*1.3*sign],yaw,scale:[1,1,1],railLength:span});
      out.push({id:"metal-straight",position:[bottom.x+dx*1.2,0,bottom.y+dz*1.2],yaw:yaw+Math.PI/2,scale:[1,1,1],railLength:2.6});
    }
    for(const p of l.PILLARS)add("pillar",p.x+p.w/2,0,p.y+p.h/2,[p.w/2,1,p.h/2]);
    if(!overview)for(let x=1.5;x<l.WIDTH;x+=3)for(let z=1.5;z<l.HEIGHT;z+=3)add("ceiling-panel",x,6,z);
    for(let x=6;x<l.WIDTH;x+=12)for(const z of [5,l.HEIGHT-5])add("light-strip",x,5.9,z);
    for(const f of l.FACILITIES)add("marking-queue",f.head.x,.015,f.head.y,[1,1,1],Math.atan2(f.queueDirection?.x??-1,f.queueDirection?.y??0));
    return out;
}
