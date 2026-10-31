import type { WorldDefinition } from "../../shared/world";

/** One overhead sign per service bank, shared by the game and asset showroom. */
export function serviceBankSigns(d:WorldDefinition){
 const banks=new Map<string,{id:string;text:string;x:number;west:boolean}>();
 for(const f of d.layout.FACILITIES.filter(f=>f.kind!=="tvm")){
  const id=`${f.kind}:${f.pos.x}`;
  banks.set(id,{id,text:f.kind==="security"?"售票与安检 / 进站 →":"检票进站 / 站台 ↓",x:f.pos.x,west:(f.queueDirection?.x??-1)<0});
 }
 return [...banks.values()];
}
export const stationNamePositions=(d:WorldDefinition)=>[12,d.layout.WIDTH/2,d.layout.WIDTH-12];
export const stationLightPositions=(d:WorldDefinition)=>Array.from({length:Math.floor((d.layout.WIDTH-3)/12)+1},(_,i)=>6+i*12).filter(x=>x<d.layout.WIDTH-3);
