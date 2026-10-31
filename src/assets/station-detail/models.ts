import { Group, Mesh, MeshStandardMaterial, BoxGeometry, CylinderGeometry, TorusGeometry, SphereGeometry, Shape, ShapeGeometry, ExtrudeGeometry, LatheGeometry, Vector2, Vector3, DoubleSide, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GeneratedPalette } from '../../ui/scene/generatedSurfaces';
import { metreUV } from '../../ui/scene/surfaceGeometry';
import { propDefinition } from '../../shared/stationProps';
type V=[number,number,number];
export function detailMaterials(p:GeneratedPalette){
 const mat=(name:string,color:string)=>{const m=p.paint.clone();m.name='detail.'+name;m.color.set(color);return m;};
 const leaf=mat('leaf','#477657');leaf.side=DoubleSide;leaf.roughness=.85;
 return {leaf,leafLight:mat('leaf-light','#6d9865'),soil:mat('soil','#645546'),flower:mat('flower','#d99c8f'),yellow:mat('safety-yellow','#d0ae4a')};
}
export type DetailMaterials=ReturnType<typeof detailMaterials>;
export function createDetailAsset(id:string,variant:number,p:GeneratedPalette,extra:DetailMaterials,low=false):Group{
 const d=propDefinition(id),root=new Group(),v=variant%2;root.name=id;root.userData={assetId:id,units:'metres',front:'+Z',version:1};
 const mesh=(name:string,g:BoxGeometry|CylinderGeometry|TorusGeometry|SphereGeometry|ShapeGeometry|ExtrudeGeometry|LatheGeometry|RoundedBoxGeometry,m:MeshStandardMaterial,at:V=[0,0,0],parent:Object3D=root)=>{metreUV(g,Number(m.userData.metres??1));const n=new Mesh(g,m);n.name=name;n.position.set(...at);n.castShadow=!m.transparent;n.receiveShadow=true;parent.add(n);return n;};
 const box=(name:string,size:V,at:V,m=p.paint,parent:Object3D=root,r=.012)=>mesh(name,r?new RoundedBoxGeometry(...size,1,r):new BoxGeometry(...size),m,at,parent);
 const cyl=(name:string,r:number,h:number,at:V,m=p.steel,parent:Object3D=root,rt=r)=>mesh(name,new CylinderGeometry(rt,r,h,low?8:16),m,at,parent);
 const bar=(name:string,a:V,b:V,r=.015,m=p.steel,parent:Object3D=root)=>{const x=new Vector3(...a),y=new Vector3(...b),delta=y.clone().sub(x);const n=cyl(name,r,delta.length(),x.add(y).multiplyScalar(.5).toArray(),m,parent);n.quaternion.setFromUnitVectors(new Vector3(0,1,0),delta.normalize());return n;};
 const hinge=(name:string,at:V)=>{const g=new Group();g.name=name;g.position.set(...at);g.userData.role='futureHinge';root.add(g);return g;};
 const feet=(w:number,depth:number)=>{for(const x of [-w/2+.08,w/2-.08])for(const z of [-depth/2+.06,depth/2-.06])cyl('adjustable_foot',.025,.06,[x,.03,z],p.rubber);};
 const frame=(w:number,h:number,depth:number,y=h/2,m=p.steel)=>{for(const x of [-w/2,w/2])box('frame_side',[.035,h,depth],[x,y,0],m);for(const sy of [-1,1])box('frame_rail',[w,.035,depth],[0,y+sy*h/2,0],m);};
 const label=(name:string,w:number,h:number,at:V,m=p.jade)=>box('label_'+name,[w,h,.006],at,m,root,0);
 const plant=(at:V,style:number,scale=1)=>{
   for(let i=0;i<(low?5:style===2?17:11);i++){
     const angle=i*2.399+v*.6,spread=(style===2?.3:.22)*scale,height=(style===2?.4:.75)*( .6+(i%5)*.1)*scale;
     const x=at[0]+Math.cos(angle)*spread,z=at[2]+Math.sin(angle)*spread;
     bar('plant_stem',at,[x,at[1]+height,z],.007*scale,extra.leaf);
     for(let j=0;j<(low?1:2);j++){
       const leaf=new Shape(),w=(style===1?.035:.1)*scale,len=(style===1?.35:.23)*scale;
       leaf.moveTo(0,0);leaf.quadraticCurveTo(w,len*.55,0,len);leaf.quadraticCurveTo(-w,len*.55,0,0);
       const n=mesh('leaf_blade',new ShapeGeometry(leaf,low?3:6),i%3?extra.leaf:extra.leafLight,[x,at[1]+height*(.5+j*.25),z]);n.rotation.set(.65+j*.4,angle+j*2,.3);n.scale.setScalar(style===2?.7:1);
     }
   }
 };
 if(id.startsWith('bin-')){
   const [w,h,depth]=d.size,n=id==='bin-double'?2:1;
   for(let i=0;i<n;i++){
     const x=(i-(n-1)/2)*w/n,cw=w/n-.025;
     box('bin_inner_bag',[cw-.065,h-.16,depth-.07],[x,(h-.16)/2,.005],p.rubber);
     for(const s of [-1,1])box('side_shell',[.025,h,depth],[x+s*cw/2,h/2,0],p.steel);
     box('back_shell',[cw,h,.025],[x,h/2,-depth/2],p.steel);
     const door=hinge('cleanout_door_'+i,[x-cw/2,0,depth/2]);box('door_panel',[cw-.02,h-.3,.025],[cw/2,(h-.3)/2,0],v?p.paint:p.steel,door);
     box('opening_lip',[cw,.035,.1],[x,h-.24,depth/2],p.steel);box('hood',[cw,.11,depth],[x,h-.055,0],p.steel);
     label(i?'other':'recycle',cw*.65,.14,[x,h*.52,depth/2+.018],i?p.rubber:p.jade);
     box('handle',[.08,.02,.02],[x+cw*.3,.58,depth/2+.02],p.rubber);feet(w,depth);
   }
 }else if(id.startsWith('plant-')){
   const w=d.size[0],depth=d.size[2],h=id==='plant-box'?.5:.55;
   if(id==='plant-round'){
     const points=[[.19,0],[.24,.04],[.3,h-.03],[.3,h],[.275,h],[.265,.1],[.19,.06]].map(a=>new Vector2(a[0],a[1]));mesh('hollow_ceramic_pot',new LatheGeometry(points,low?10:24),v?p.sage:p.paint);
     cyl('soil_surface',.265,.02,[0,h-.04,0],extra.soil);plant([0,h-.02,0],0);
   }else{
     for(const x of [-w/2,w/2])box('pot_wall',[.035,h,depth],[x,h/2,0],v?p.sage:p.paint);
     for(const z of [-depth/2,depth/2])box('pot_wall',[w,.035+h-.035,.035],[0,h/2,z],v?p.sage:p.paint);
     box('soil_surface',[w-.04,.03,depth-.04],[0,h-.05,0],extra.soil);
     if(id==='plant-box')for(const x of [-.48,0,.48])plant([x,h-.02,0],2,.8);else plant([0,h-.02,0],1);
   }
   if(!low)for(let i=0;i<8;i++)cyl('surface_pebble',.025,.018,[Math.cos(i*2.4)*.15,h-.025,Math.sin(i*2.4)*.15],p.stone);
 }else if(id.startsWith('bench-')){
   const metal=id==='bench-metal',w=d.size[0],chairs=metal?3:4;
   bar('underseat_beam',[-w/2+.12,.38,0],[w/2-.12,.38,0],.045);
   for(const x of [-w*.35,w*.35]){bar('support_leg',[x,.05,-.18],[x,.45,0],.035);bar('support_leg',[x,.05,.22],[x,.45,0],.035);box('bolted_foot',[.24,.035,.55],[x,.025,0],p.steel);}
   for(let i=0;i<chairs;i++){
     const x=(i-(chairs-1)/2)*(w/chairs),shape=new Shape();shape.moveTo(-.28,.04);shape.quadraticCurveTo(0,-.03,.27,.04);shape.lineTo(.36,.43);shape.lineTo(.31,.45);shape.lineTo(.22,.09);shape.quadraticCurveTo(0,.025,-.28,.09);
     const g=new ExtrudeGeometry(shape,{depth:w/chairs-.07,bevelEnabled:false,steps:1,curveSegments:8});g.rotateY(Math.PI/2);g.translate(x-(w/chairs-.07)/2,.48,0);mesh('curved_seat_back',g,metal?p.steel:p.sage);
     if(v||i===0||i===chairs-1){bar('arm_support',[x-.29,.5,.15],[x-.29,.76,.15],.018);bar('arm_rest',[x-.29,.76,-.2],[x-.29,.76,.22],.023);}
     if(!low)for(let j=0;j<5;j++)box('seat_perforation',[.008,.004,.3],[x-.2+j*.1,.574,-.07],p.rubber);
   }
 }else if(['vending','locker','flower-cabinet','photo-booth','toy-cabinet','storage-cabinet','charging'].includes(id)){
   const [w,h,depth]=d.size;feet(w,depth);box('cabinet_back',[w,h-.06,.035],[0,h/2,-depth/2],p.paint);
   for(const x of [-w/2,w/2])box('cabinet_side',[.045,h,depth],[x,h/2,0],v?p.sage:p.paint);
   for(const y of [.08,h-.03])box('cabinet_cap',[w,.06,depth],[0,y,0],p.paint);
   if(id==='locker'||id==='storage-cabinet'){
     const cols=id==='locker'?3:2,rows=id==='locker'?4:2;
     for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const cw=w/cols,ch=(h-.1)/rows,x=-w/2+i*cw+.015,y=.08+j*ch;const door=hinge('locker_door_'+i+'_'+j,[x,y,depth/2]);box('door',[cw-.035,ch-.035,.025],[cw/2,ch/2,0],(i+j+v)%3?p.paint:p.jade,door);box('lock',[.045,.08,.025],[cw-.08,ch/2,.02],p.rubber,door);}
   }else if(id==='photo-booth'){
     box('photo_backdrop',[w-.1,h-.15,.02],[0,h/2,-depth/2+.06],p.sage);box('privacy_curtain',[w*.55,h-.2,.03],[-w*.2,h/2,depth/2],p.jade);
     cyl('stool',.18,.08,[.2,.55,0],p.rubber);bar('stool_stem',[.2,.05,0],[.2,.5,0],.04);label('photo_screen',.25,.3,[w/2-.2,1.5,depth/2+.02],p.screen);
   }else if(id==='charging'){
     for(let i=0;i<6;i++)box('power_bank',[.035,.13,.09],[-.12+i*.048,h-.1,.07],p.jade);label('screen',.22,.22,[0,h-.4,depth/2+.02],p.screen);
   }else{
     const front=depth/2;box('lower_door',[w-.05,.42,.03],[0,.29,front],p.paint);box('pickup_opening',[w*.64,.12,.02],[-.05,.29,front+.02],p.rubber);
     frame(w-.08,h-.5,.035,(h+.4)/2);box('display_glass',[w-.14,h-.61,.015],[0,(h+.45)/2,front],p.glass);
     for(let row=0;row<3;row++){const y=.65+row*.38;box('shelf',[w-.12,.025,depth-.1],[0,y,.05],p.steel);
       for(let col=0;col<3;col++){const x=(col-1)*w*.23;
         if(id==='flower-cabinet'){plant([x,y+.02,.08],1,.28);for(let k=0;k<3;k++)cyl('flower_petals',.07,.025,[x+k*.025,y+.24,.08],extra.flower);}
         else if(id==='toy-cabinet'){cyl('toy_body',.065,.13,[x,y+.1,.12],col%2?p.jade:extra.flower);cyl('toy_head',.075,.09,[x,y+.21,.12],p.paint);}
         else {cyl('bottle',.045,.17,[x,y+.11,.12],(col+v)%2?p.jade:p.paint);cyl('bottle_cap',.022,.03,[x,y+.21,.12],p.red);label('bottle_label',.07,.05,[x,y+.12,.17]);}
       }
     }
     label('payment_screen',.13,.22,[w/2-.12,1.4,front+.025],p.screen);box('header',[w,.16,.06],[0,h-.12,front],v?p.jade:p.sage);
   }
 }else if(id==='flower-cart'){
   box('cart_shelf',[1.5,.06,.65],[0,.65,0],p.stone);for(const x of [-.6,.6])for(const z of [-.24,.24]){bar('cart_leg',[x,.12,z],[x,.65,z]);cyl('wheel',.065,.04,[x,.08,z],p.rubber).rotation.x=Math.PI/2;}
   for(const x of [-.5,0,.5]){cyl('flower_bucket',.12,.3,[x,.83,0],p.steel);plant([x,.98,0],1,.4);for(let i=0;i<3;i++)cyl('flowers',.08,.04,[x+i*.04,1.25,0],extra.flower);}
 }else if(id==='security-table'){
   box('worktop',[1.8,.06,.7],[0,.78,0],p.steel);for(const x of [-.8,.8])for(const z of [-.25,.25])bar('leg',[x,.03,z],[x,.75,z],.022);box('shelf',[1.6,.03,.5],[0,.25,0],p.steel);
   for(let i=0;i<(v?5:3);i++){const y=.83+i*.035;box('tray_bottom',[.5,.018,.35],[.35,y,0],p.sage);for(const x of [.1,.6])box('tray_rim',[.015,.04,.35],[x,y+.02,0],p.sage);for(const z of [-.17,.17])box('tray_rim',[.5,.04,.015],[.35,y+.02,z],p.sage);}
 }else if(id==='staff-chair'){
   box('seat',[.44,.07,.42],[0,.47,0],p.rubber);box('back',[.44,.35,.06],[0,.76,-.18],p.rubber);for(const x of [-.18,.18])for(const z of [-.16,.16])bar('chair_leg',[x,.02,z],[x,.45,z]);
 }else if(id==='cleaning-cart'||id==='mop-bucket'||id==='wet-sign'||id==='barrier-store'){
   if(id==='wet-sign'){for(const s of [-1,1]){const n=box('folded_sign',[.34,.58,.018],[0,.31,s*.05],extra.yellow);n.rotation.x=s*.08;}label('caution',.2,.14,[0,.38,.085],p.rubber);}
   else if(id==='barrier-store'){for(let i=0;i<4;i++){const x=(i%2-.5)*.26,z=(Math.floor(i/2)-.5)*.2;cyl('base',.12,.04,[x,.02,z]);bar('post',[x,.05,z],[x,.95,z],.022);cyl('belt_head',.045,.08,[x,.96,z],p.rubber);}}
   else{const w=d.size[0],dep=d.size[2];box('bucket_base',[w,.05,dep],[0,.1,0],p.jade);for(const x of [-w/2,w/2])box('bucket_wall',[.025,.45,dep],[x,.35,0],v?p.jade:p.paint);for(const z of [-dep/2,dep/2])box('bucket_wall',[w,.45,.025],[0,.35,z],p.jade);for(const x of [-w*.35,w*.35])cyl('castor',.045,.04,[x,.05,.15],p.rubber).rotation.x=Math.PI/2;bar('mop_handle',[.12,.2,0],[.18,1.2,0],.012);box('mop_head',[.23,.07,.14],[.12,.2,0],p.stone);if(id==='cleaning-cart'){box('upper_tray',[.7,.04,.45],[0,.85,0],p.steel);bar('handle',[-.3,.3,-.2],[-.3,1,-.2]);}}
 }else if(['equipment-door','police-door','toilet-door','lift-door','service-window'].includes(id)){
   const [w,h]=d.size;frame(w,h,.12,h/2);const door=hinge('door_leaf',[-w/2,0,0]);
   if(id==='service-window'){box('counter',[w,.08,.3],[0,.95,.12],p.stone);box('service_glass',[w-.1,1.2,.018],[0,1.65,0],p.glass);box('cash_slot',[.45,.06,.05],[0,1.06,.04],p.rubber);label('intercom',.12,.16,[.7,1.15,.18],p.rubber);}
   else{box('door_panel',[w-.06,h-.05,.045],[w/2,h/2,0],v?p.sage:p.paint,door);bar('pull_handle',[w/2-.1,1,.08],[w/2-.1,1.3,.08],.018);box('door_seam',[.012,h-.1,.012],[0,h/2,.03],p.rubber);if(id==='police-door')box('observation_window',[.55,.5,.03],[0,1.65,.04],p.glass);if(id==='equipment-door')for(let i=0;i<6;i++)box('vent_slot',[w*.6,.015,.012],[0,.25+i*.045,.04],p.rubber);if(id==='lift-door')label('call_button',.06,.13,[w/2+.09,1.1,.05],p.screen);}
   box('closer',[.22,.04,.06],[w*.3,h-.1,.08],p.steel);label('room_sign',w*.6,.18,[0,h-.3,.08],p.jade);
 }else if(['lightbox','notice-board','station-map','fare-map','platform-display','fire-cabinet','aed','help-panel','access-panel'].includes(id)){
   const [w,h,depth]=d.size;frame(w,h,depth,h/2,id==='fire-cabinet'?p.red:p.steel);box('panel_back',[w-.03,h-.03,.025],[0,h/2,-depth/2],p.paint);
   if(id==='fire-cabinet'||id==='aed'){
     const door=hinge('glass_cabinet_door',[-w/2,0,depth/2]);box('glass',[w-.06,h-.06,.012],[w/2,h/2,0],p.glass,door);
     if(id==='fire-cabinet'){for(const x of [-.18,.18]){cyl('extinguisher',.07,.4,[x,.35,0],p.red);bar('extinguisher_handle',[x,.55,0],[x+.05,.6,0],.012);}}
     else box('aed_unit',[.25,.3,.08],[0,h/2,0],p.jade);label('safety',w*.65,.12,[0,h-.16,depth/2+.02],id==='aed'?p.jade:p.red);
   }else{box('graphic_surface',[w-.08,h-.08,.014],[0,h/2,depth/2+.005],id==='platform-display'?p.screen:id==='lightbox'?p.light:p.paint);}
 }else if(id==='vent'){
   frame(.85,.28,.05,.14);for(let i=0;i<7;i++)box('louvre',[.8,.014,.09],[0,.025+i*.037,.02],p.steel);
 }else if(id==='cctv'){
   cyl('camera_mount',.11,.04,[0,-.02,0],p.paint);mesh('camera_dome',new SphereGeometry(.09,low?8:16,8,0,Math.PI*2,0,Math.PI/2),p.glass,[0,-.04,0]).rotation.x=Math.PI;cyl('lens',.035,.055,[0,-.1,.035],p.rubber).rotation.x=Math.PI/2;
 }else if(id==='speaker'){
   box('speaker_housing',[.24,.3,.16],[0,-.15,0],p.paint);for(let i=0;i<7;i++)box('speaker_grille',[.2,.012,.015],[0,-.04-i*.033,.09],p.rubber);
 }else if(id==='smoke-detector'){
   cyl('detector',.07,.045,[0,-.025,0],p.paint);cyl('detector_grille',.055,.01,[0,-.05,0],p.steel);
 }else if(id==='ceiling-light'){
   for(const x of [-.6,.6])bar('suspension',[x,0,0],[x,-.25,0],.008);box('light_housing',[1.5,.08,.18],[0,-.29,0],p.steel);box('diffuser',[1.44,.015,.14],[0,-.34,0],p.light);
 }else if(id==='screen-door'){
   frame(1.6,3,.12,1.5);box('header',[1.6,.25,.12],[0,2.875,0],p.steel);
   for(const s of [-1,1]){const door=hinge('screen_sliding_leaf_'+s,[s*.4,0,0]);box('glass_leaf',[.76,2.62,.018],[0,1.32,0],p.glass,door);box('door_edge',[.02,2.62,.035],[s*.38,1.32,0],p.steel,door);box('visibility_band',[.76,.055,.022],[0,1.35,0],p.jade,door);}
   box('threshold',[1.6,.04,.16],[0,.02,0],p.steel);label('door_number',.25,.1,[0,2.85,.07],p.jade);
 }else if(id==='queue-mark'){
   for(const s of [-1,1]){box('queue_line',[.045,.006,.8],[s*.6,.006,0],p.jade);box('queue_head',[.3,.006,.045],[s*.48,.006,-.4],p.jade);}box('alighting_arrow',[.08,.006,.8],[0,.006,.1],extra.yellow);
 }else if(id==='skirting'){
   box('skirting',[3,.16,.035],[0,.08,0],p.steel);box('wall_joint',[.012,2.8,.012],[-1.49,1.4,0],p.rubber);
 }else if(id==='column-trim'){
   for(const s of [-1,1]){box('column_base',[1.25,.25,.025],[0,.125,s*.775],p.steel);box('column_base',[.025,.25,1.55],[s*.625,.125,0],p.steel);}
 }else if(id==='drain'){
   box('drain_dark',[2,.015,.22],[0,0,0],p.rubber);for(let i=0;i<40;i++)box('drain_grille',[.018,.018,.21],[-.975+i*.05,.01,0],p.steel);
 }
 for(const a of d.anchors){const g=new Group();g.name='anchor_'+a.name;g.position.set(...a.position);g.userData.role='anchor';root.add(g);}
 return root;
}
