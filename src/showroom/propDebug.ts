import {Group,Box3Helper,Box3,Vector3,Color,AxesHelper,Mesh} from 'three';
import {propDefinition} from '../shared/stationProps';
export function propDebug(assetId:string){const a=propDefinition(assetId),[w,h,d]=a.size,root=new Group();root.name='prop-debug';
 const body=new Box3Helper(new Box3(new Vector3(-w/2,0,-d/2),new Vector3(w/2,h,d/2)),new Color('#397ac2'));root.add(body);
 if(a.useDepth>0){const use=new Box3Helper(new Box3(new Vector3(-w/2,.015,d/2),new Vector3(w/2,.025,d/2+a.useDepth)),new Color('#6aaf58'));root.add(use);}
 for(const anchor of a.anchors){const axes=new AxesHelper(.3);axes.position.set(...anchor.position);root.add(axes);}root.visible=false;
 return {root,dispose(){root.traverse(n=>{if('geometry'in n)(n as Mesh).geometry.dispose();if('material'in n){const m=(n as Mesh).material;for(const material of Array.isArray(m)?m:[m])material.dispose();}});}};
}
