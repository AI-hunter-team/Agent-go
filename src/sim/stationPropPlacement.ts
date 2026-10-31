import type { WorldDefinition } from '../shared/world';
import { propDefinition, type PropPlacement, type PropCluster } from '../shared/stationProps';
import type { Rect } from './geometry';
import { Rng } from './rng';
const overlap=(a:Rect,b:Rect,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w>b.x-pad&&a.y<b.y+b.h+pad&&a.y+a.h>b.y-pad;
export function populateStationProps(d:WorldDefinition):PropPlacement[]{
 const props:PropPlacement[]=[],l=d.layout,rng=new Rng(d.seed).fork('station-props-v1');
 const occupied=[...l.PILLARS,...(l.solids??[]),...l.ATTRACTIONS.flatMap(a=>a.body?[a.body]:[])];
 const reserved:Rect[]=[...l.ITEM_SPOTS.map(s=>({x:s.pos.x-1,y:s.pos.y-1,w:2,h:2,floorId:s.pos.floorId})),...(l.openings??[]).map(r=>({...r,x:r.x-1,y:r.y-1,w:r.w+2,h:r.h+2})),...l.NAV_NODES.map(n=>({x:n.pos.x-1.4,y:n.pos.y-1.4,w:2.8,h:2.8,floorId:n.pos.floorId})),...l.FACILITIES.flatMap(f=>Array.from({length:5},(_,i)=>({x:f.head.x+(f.queueDirection?.x??-1)*i*.98-1,y:f.head.y+(f.queueDirection?.y??0)*i*.98-1,w:2,h:2}))),...l.FACILITIES.map(f=>({x:Math.min(f.pos.x,f.head.x)-1.4,y:Math.min(f.pos.y,f.head.y)-1.4,w:Math.abs(f.pos.x-f.head.x)+2.8,h:Math.abs(f.pos.y-f.head.y)+2.8}))];
 const add=(assetId:string,x:number,z:number,yaw=0,cluster:PropCluster='entrance',floor:'concourse'|'platform'='concourse',elevation=0,label?:string)=>{
   const a=propDefinition(assetId),side=Math.abs(Math.sin(yaw))>.7,w=side?a.size[2]:a.size[0],h=side?a.size[0]:a.size[2];
   const rect:Rect={x:x-w/2,y:z-h/2,w,h,floorId:floor},front={x:Math.sin(yaw),y:Math.cos(yaw)};
   const useSpace=a.solid?{x:rect.x+front.x*a.useDepth/2-Math.abs(front.x)*a.useDepth/2,y:rect.y+front.y*a.useDepth/2-Math.abs(front.y)*a.useDepth/2,w:w+Math.abs(front.x)*a.useDepth,h:h+Math.abs(front.y)*a.useDepth,floorId:floor}:null;
   if(a.solid){
     if(floor==='concourse'&&(rect.x<.25||rect.y<.25||rect.x+w>l.WIDTH-.25||rect.y+h>l.HEIGHT-.25))return false;
     if([...occupied,...reserved].some(r=>(r.floorId??'concourse')===floor&&overlap(rect,r,.55)))return false;
     if(props.some(p=>p.body&&p.pos.floorId===floor&&(overlap(rect,p.body,.4)||(p.useSpace&&overlap(rect,p.useSpace,.15)))))return false;
     if(useSpace&&occupied.some(r=>(r.floorId??'concourse')===floor&&overlap(useSpace,r,.1)))return false;
   }
   const id='prop-'+cluster+'-'+assetId+'-'+props.length;props.push({id,assetId,variant:rng.pick([0,1]),pos:{x,y:z,floorId:floor},elevation,yaw,cluster,body:a.solid?rect:null,useSpace,label});return true;
 };
 const wall=(id:string,x:number,north=true,cluster:PropCluster='entrance',y=0)=>{
 const z=north?.23:l.HEIGHT-.23,w=propDefinition(id).size[0];
 if((d.entrances??[]).some(e=>Math.abs(e.foot.y-z)<2&&Math.abs(e.foot.x-x)<e.width/2+w/2+.3))return false;
 return add(id,x,z,north?0:Math.PI,cluster,'concourse',y);
 };
 const edge=(id:string,wanted:number,cluster:PropCluster)=>{let placed=0;const candidates=[];for(let x=3;x<l.WIDTH-3;x+=2.5)for(const north of [true,false])candidates.push({x,north});for(const c of candidates.sort((a,b)=>{const centre=cluster==='entrance'?4:cluster==='convenience'?l.WIDTH*.35:cluster==='rest'?l.WIDTH*.6:cluster==='security'?l.WIDTH*.25:l.WIDTH-15;return Math.abs(a.x-centre)-Math.abs(b.x-centre)+(a.north===b.north?0:(a.north?-.2:.2));})){const a=propDefinition(id),z=c.north?.35+a.size[2]/2:l.HEIGHT-.35-a.size[2]/2;if(add(id,c.x,z,c.north?0:Math.PI,cluster)&&++placed>=wanted)break;}return placed;};
 edge('bin-double',2,'entrance');edge('bin-slim',rng.pick([0,1,2]),'convenience');
 const garden=d.seed%4===0;edge(garden?'plant-box':'plant-round',2,'rest');if(!garden)edge('plant-square',rng.pick([0,1,2]),'rest');
 edge('bench-metal',1,'rest');edge('vending',1,'convenience');edge('charging',1,'convenience');edge(rng.pick(['locker','flower-cabinet','photo-booth','toy-cabinet']),1,'convenience');
 for(const id of ['staff-chair','storage-cabinet'])edge(id,1,'security');
 edge('cleaning-cart',1,'maintenance');edge('mop-bucket',1,'maintenance');edge('wet-sign',1,'maintenance');edge('barrier-store',1,'maintenance');
 for(let x=1.5;x<l.WIDTH;x+=3){wall('skirting',x,true);wall('skirting',x,false);}
 for(const pillar of l.PILLARS)add('column-trim',pillar.x+pillar.w/2,pillar.y+pillar.h/2,0,'maintenance');
 for(const [i,id] of ['notice-board','station-map','fare-map','lightbox','lightbox','aed','fire-cabinet','access-panel','equipment-door','police-door','toilet-door','lift-door'].entries()){
   const x=3+(i*5.3)%(l.WIDTH-6);wall(id,x,i%2===0,i<5?'entrance':'maintenance',id.includes('door')?0:id==='aed'?1:1.1);
 }
 for(let x=6;x<l.WIDTH-3;x+=12){wall('vent',x,true,'maintenance',4.5);wall('speaker',x,false,'maintenance',5.5);for(const z of [5,l.HEIGHT-5]){add('ceiling-light',x,z,0,'maintenance','concourse',5.9);add('smoke-detector',x+2,z,0,'maintenance','concourse',5.9);}add('cctv',x,1,0,'maintenance','concourse',5.8);}
 for(const e of d.entrances??[])add('drain',e.bottom.x,e.bottom.y,Math.atan2(e.inward.x,e.inward.y),'entrance');
 const centre=l.platformAxis!.center;
 for(const x of [6,l.WIDTH-6]){add('bin-double',x,centre,0,'platform','platform');add('bench-metal',x+2,centre,0,'platform','platform');add('platform-display',x,centre,0,'platform','platform',2.8);add('help-panel',x,centre+5.8,0,'platform','platform',1.2);}
 return props;
}
