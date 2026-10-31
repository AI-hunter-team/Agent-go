import {expect,test} from "vitest";
import {setImmediate as yieldToHost} from "node:timers/promises";
import {generateWorld} from "../src/sim/worldDefinition";
import {World} from "../src/sim/world";
import {generatedTrainDoors} from "../src/shared/generatedTrain";
import {CONNECTOR_STEPS,platformClearanceBlocks} from "../src/shared/connectorGeometry";
import {cameraFraction} from "../src/ui/scene/cameraCollision";
import {stationAtlas} from "../src/ui/stationMap";
const seeds=[1,5,7,8,27,29,3,17,41,9,10,23];
test.each(seeds)("seed %i routes every lower connector to every door around the inclined slabs",async seed=>{
 const d=generateWorld(seed,{version:"metro-v3"}),w=new World(seed,150,undefined,d);
 let samples=0,routes=0;
 for(const start of d.connectors!)for(const door of generatedTrainDoors(d)){
  if(routes++%12===0)await yieldToHost();
  const path=w.navigation.findPath(start.to,door.pos,.32);expect(path,`${start.id} -> ${door.id}`).not.toBeNull();let from=start.to;
  for(const to of path!){const distance=Math.hypot(to.x-from.x,to.y-from.y);
   for(let f=0;f<=1;f+=.1/Math.max(.1,distance)){const x=from.x+(to.x-from.x)*f,y=from.y+(to.y-from.y)*f;
    for(const c of d.connectors!){const dx=c.to.x-c.from.x,dy=c.to.y-c.from.y,run=Math.hypot(dx,dy),along=((x-c.from.x)*dx+(y-c.from.y)*dy)/run,across=Math.abs(((x-c.from.x)*dy-(y-c.from.y)*dx)/run),top=-6*Math.ceil(along/(run/CONNECTOR_STEPS))/CONNECTOR_STEPS,underside=-6*along/run-.26;
     samples++;
     // Check every original sample, allocating an assertion error only if the invariant fails.
     if(along>0&&along<run&&across<c.width/2&&top>-5.95&&underside<-4.3)throw new Error(`${start.id} -> ${door.id}: ${c.id} at ${x},${y}`);
    }
   }from=to;
  }
 }
 expect(samples).toBeGreaterThan(0);
 for(const {id,bounds} of platformClearanceBlocks(d.connectors))expect(stationAtlas(d).floors.find(f=>f.id==="platform")!.shapes.find(s=>s.id===id)?.bounds).toEqual(bounds);
});
test("camera stops before an inclined slab rather than passing through its underside",()=>{
 const d=generateWorld(1,{version:"metro-v3"}),c=d.connectors![0],x=c.from.x+8;
 expect(cameraFraction({x,y:-4.8,z:c.from.y-2},{x,y:-4.1,z:c.from.y},d)).toBeLessThan(1);
 expect(cameraFraction({x:c.to.x+2,y:-4.5,z:c.to.y-2},{x:c.to.x+2,y:-4.5,z:c.to.y+2},d)).toBe(1);
});
