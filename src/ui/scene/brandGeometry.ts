import { ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape } from "three";
import { brandVector, BRAND_COLORS, type BrandPoint } from "../../assets/brand";
function draw(path:Path,points:readonly BrandPoint[],height:number){
 const last=points.at(-1)!,first=points[0];path.moveTo((last[0]+first[0])/2,height-(last[1]+first[1])/2);
 for(let i=0;i<points.length;i++){const p=points[i],n=points[(i+1)%points.length];path.quadraticCurveTo(p[0],height-p[1],(p[0]+n[0])/2,height-(p[1]+n[1])/2);}path.closePath();
}
/** Same vector master as the SVG exports; bevel depth is specified in metres. */
export function createBrandSculpture(width=3.65){
 const root=new Group(),vector=brandVector(),scale=width/vector.width;
 const materials={ink:new MeshStandardMaterial({color:BRAND_COLORS.ink,roughness:.88}),yellow:new MeshStandardMaterial({color:BRAND_COLORS.yellow,roughness:.82})};
 root.name="lounge-brand";root.userData.ownedMaterials=Object.values(materials);
 for(const contour of vector.shapes){const shape=new Shape();draw(shape,contour.outline,vector.height);for(const hole of contour.holes){const path=new Path();draw(path,hole,vector.height);shape.holes.push(path);}
  const geometry=new ExtrudeGeometry(shape,{depth:.02/scale,bevelEnabled:true,bevelThickness:.002/scale,bevelSize:.002/scale,bevelSegments:2,curveSegments:3,steps:1});geometry.scale(scale,scale,scale);
  const mesh=new Mesh(geometry,materials[contour.color]);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 }return root;
}
