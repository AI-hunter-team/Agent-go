import {useMemo,useEffect} from 'react';
import {Group} from 'three';
import {ATTRACTIONS} from '../../sim/layout';
import {createDetailAsset,detailMaterials} from '../../assets/station-detail/models';
import {propGraphic} from '../../assets/station-detail/graphics';
import {createGeneratedPalette} from './generatedSurfaces';
import {disposeSurfaceGeometry} from './surfaceGeometry';
import {Sign} from './Sign';
export function CommercialFeatures(){
 const scene=useMemo(()=>{const p=createGeneratedPalette(),extra=detailMaterials(p),root=new Group(),graphics:ReturnType<typeof propGraphic>[]=[];
 for(const a of ATTRACTIONS){if(a.kind==='information')continue;const id=a.kind==='toys'?'toy-cabinet':a.kind==='advert'?'lightbox':a.kind==='flowers'?'flower-cart':'bench-sage';const model=createDetailAsset(id,0,p,extra);model.position.set(a.pos.x,0,a.pos.y);root.add(model);const graphic=propGraphic(id,0);if(graphic){graphic.mesh.position.set(0,id==='lightbox'?1:1.85,id==='lightbox'?.08:.4);model.add(graphic.mesh);graphics.push(graphic);}}
 return {root,dispose(){disposeSurfaceGeometry(root);graphics.forEach(g=>g?.dispose());Object.values(extra).forEach(m=>m.dispose());p.dispose();}};},[]);
 useEffect(()=>scene.dispose,[scene]);
 return <group><primitive object={scene.root} dispose={null}/>{ATTRACTIONS.filter(a=>a.kind==='information').map(a=><Sign key={a.id} text='前方验票 → 楼梯 / 扶梯 ↓' position={[a.pos.x,2.8,a.pos.y]} width={5.5}/>)}</group>;
}
