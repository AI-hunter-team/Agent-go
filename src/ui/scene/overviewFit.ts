import { Matrix4,OrthographicCamera,Vector3 } from "three";
import type { Rect } from "../../sim/geometry";
/** Fit the entire two-floor envelope after the dock and camera transforms. */
export function fitStationOverview(camera:OrthographicCamera,bounds:Rect,dock:Matrix4,aspect:number){
 camera.updateMatrixWorld(true);let x=0,y=0;
 for(const along of [bounds.x,bounds.x+bounds.w])for(const across of [bounds.y,bounds.y+bounds.h])for(const elevation of [-8,7]){
  const point=new Vector3(along,elevation,across).applyMatrix4(dock).applyMatrix4(camera.matrixWorldInverse);
  x=Math.max(x,Math.abs(point.x));y=Math.max(y,Math.abs(point.y));
 }
 const halfHeight=Math.max(28,y+2,(x+2)/Math.max(.1,aspect)),halfWidth=halfHeight*aspect;
 if(Math.abs(camera.right-halfWidth)>.001||Math.abs(camera.top-halfHeight)>.001){camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}
}
