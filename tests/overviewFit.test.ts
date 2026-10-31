import { it,expect } from "vitest";
import { Group,Matrix4,OrthographicCamera,Vector3 } from "three";
import { fitStationOverview } from "../src/ui/scene/overviewFit";
it("frames every station/entry corner on desktop and narrow screens after docking",()=>{
 for(const length of [78,102,126,150])for(const aspect of [2.03,390/600]){
  const bounds={x:-10.5,y:0,w:length+21,h:30},dock=new Matrix4().makeRotationY(Math.PI/2),parent=new Group(),camera=new OrthographicCamera(-1,1,1,-1,.1,300);
  dock.setPosition(-20,-4,10);parent.matrixAutoUpdate=false;parent.matrix.copy(dock);parent.add(camera);parent.updateMatrixWorld(true);
  const x=bounds.x+bounds.w/2;camera.position.set(x-bounds.w*.38,Math.max(62,bounds.w*.65),58);parent.updateMatrixWorld(true);camera.lookAt(new Vector3(x,-.5,15).applyMatrix4(dock));fitStationOverview(camera,bounds,dock,aspect);
  for(const along of [bounds.x,bounds.x+bounds.w])for(const across of [0,30])for(const elevation of [-8,7]){const screen=new Vector3(along,elevation,across).applyMatrix4(dock).project(camera);expect(Math.abs(screen.x)).toBeLessThan(1);expect(Math.abs(screen.y)).toBeLessThan(1);}
 }
});
