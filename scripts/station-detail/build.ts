import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {DataTexture,Mesh,Box3,Vector3,MeshStandardMaterial} from 'three';
import {STATION_PROPS} from '../../src/shared/stationProps';
import {createDetailAsset,detailMaterials} from '../../src/assets/station-detail/models';
import {createGeneratedPalette} from '../../src/ui/scene/generatedSurfaces';
import {exportGlb} from '../station-kit/glb';
import {png} from './png';
const directory=fileURLToPath(new URL('../../public/assets/station-detail/',import.meta.url)),mapDir=join(directory,'materials');
await mkdir(join(directory,'models'),{recursive:true});await mkdir(mapDir,{recursive:true});
const p=createGeneratedPalette(),extra=detailMaterials(p),materials=[...Object.values(p).filter((m):m is MeshStandardMaterial=>m instanceof MeshStandardMaterial),...Object.values(extra)];
const written=new Set<string>();
for(const m of materials){const maps:Record<string,string>={};for(const [key,texture]of [['color',m.map],['normal',m.normalMap],['roughness',m.roughnessMap]] as const){if(!(texture instanceof DataTexture))continue;const name=texture.name.replaceAll('.','-')+'-'+key+'.png';maps[key]=name;if(!written.has(name)){const image=texture.image;await writeFile(join(mapDir,name),png(image.width,image.data as Uint8Array));written.add(name);}}if(maps.color)m.userData.maps=maps;}
const assets=[];
for(const a of STATION_PROPS)for(const variant of [0,1]){
 const root=createDetailAsset(a.id,variant,p,extra),id='detail-'+a.id+'-'+variant;root.name=id;root.userData.assetId=id;
 const bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3());let triangles=0;root.traverse(n=>{if(n instanceof Mesh)triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;});
 const {bytes}=await exportGlb(root,mapDir),file='models/'+id+'.glb';await writeFile(join(directory,file),bytes);
 assets.push({id,label:a.label,variant,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()}});
 root.traverse(n=>{if(n instanceof Mesh)n.geometry.dispose();});
}
await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1,units:'metres',upAxis:'Y',front:'+Z',assets},null,2)+'\n');
await writeFile(join(directory,'sources.json'),JSON.stringify({source:'Original procedural metro fixtures, leaf geometry, graphic layouts and PBR recipes. No third-party art.',generatedFrom:['src/assets/station-detail/','src/assets/world-surfaces/','scripts/station-detail/'],thirdPartyAssets:[]},null,2)+'\n');
p.dispose();Object.values(extra).forEach(m=>m.dispose());console.log(JSON.stringify({assets:assets.length,textures:written.size,bytes:assets.reduce((n,a)=>n+a.bytes,0)}));
