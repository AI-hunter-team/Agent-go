import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Path, PlaneGeometry, Shape, Vector3, type BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { METRO_PROFILE } from "../../shared/metro";

interface Palette { interior: MeshStandardMaterial; steel: MeshStandardMaterial; roof: MeshStandardMaterial; rubber: MeshStandardMaterial; seat: MeshStandardMaterial; floor: MeshStandardMaterial; glass: MeshStandardMaterial; line: MeshStandardMaterial; light: MeshStandardMaterial; red: MeshStandardMaterial; amber: MeshStandardMaterial; joint: MeshStandardMaterial; screen: MeshStandardMaterial }
const F = METRO_PROFILE.floor, C = METRO_PROFILE.ceiling, WALL = METRO_PROFILE.interiorHalfWidth;

function add(root: Object3D, name: string, geometry: BufferGeometry, material: MeshStandardMaterial, position: number[]) {
  const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.fromArray(position); mesh.castShadow = !material.transparent; mesh.receiveShadow = true; root.add(mesh); return mesh;
}
function box(root: Object3D, name: string, size: number[], p: number[], mat: MeshStandardMaterial, radius = 0) {
  return add(root, name, radius ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius) : new BoxGeometry(size[0], size[1], size[2]), mat, p);
}
function rod(root: Object3D, name: string, a: number[], b: number[], radius: number, mat: MeshStandardMaterial) {
  const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
  const mesh = add(root, name, new CylinderGeometry(radius, radius, delta.length(), 12), mat, start.add(end).multiplyScalar(.5).toArray());
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()); return mesh;
}
function roundPath(path: Shape | Path, x: number, y: number, w: number, h: number, r: number) {
  path.moveTo(x+r,y); path.lineTo(x+w-r,y); path.quadraticCurveTo(x+w,y,x+w,y+r);
  path.lineTo(x+w,y+h-r); path.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  path.lineTo(x+r,y+h); path.quadraticCurveTo(x,y+h,x,y+h-r);
  path.lineTo(x,y+r); path.quadraticCurveTo(x,y,x+r,y); path.closePath();
}
function rounded(x: number, y: number, w: number, h: number, r: number) { const s = new Shape(); roundPath(s,x,y,w,h,r); return s; }
function cut(s: Shape, x: number, y: number, w: number, h: number, r: number) { const hole = new Path(); roundPath(hole,x,y,w,h,r); s.holes.push(hole); }
function plate(root: Object3D, name: string, shape: Shape, z: number, material: MeshStandardMaterial, depth = .025) {
  return add(root,name,new ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:5}),material,[0,0,z-depth/2]);
}
function anchor(root: Object3D, name: string, p: number[]) { const point = new Object3D(); point.name = `anchor_${name}`; point.position.fromArray(p); point.userData.role = "anchor"; root.add(point); }

/** A continuous, curved seat pan and back, with a real bevel and a recessed underside. */
function seat(root: Group, x: number, width: number, side: number, palette: Palette, priority = false) {
  const profile = new Shape();
  profile.moveTo(.02,F+.39); profile.quadraticCurveTo(-.025,F+.40,0,F+.46);
  profile.quadraticCurveTo(.16,F+.43,.32,F+.46); profile.quadraticCurveTo(.39,F+.48,.39,F+.58);
  profile.lineTo(.43,F+.91); profile.quadraticCurveTo(.44,F+.98,.49,F+.97);
  profile.quadraticCurveTo(.53,F+.97,.52,F+.90); profile.lineTo(.48,F+.55);
  profile.quadraticCurveTo(.47,F+.39,.31,F+.38); profile.lineTo(.02,F+.39);
  const geometry = new ExtrudeGeometry(profile,{depth:width-.025,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:2,curveSegments:6,steps:1});
  geometry.rotateY(-side*Math.PI/2);
  add(root,"moulded-seat",geometry,priority?palette.amber:palette.seat,[x+side*(width-.025)/2,0,side*(WALL-.54)]);
  box(root,"seat-cantilever",[width*.8,.1,.38],[x,F+.26,side*(WALL-.20)],palette.interior,.035);
  box(root,"seat-front-rim",[width-.055,.027,.034],[x,F+.405,side*(WALL-.535)],palette.steel,.012);
}

/** Authored in final cabin metres: common furniture dimensions are not stretched with the shell. */
export function createMetroInterior(bodyEnd: number, doors: number[], windows: {x:number;w:number}[], palette: Palette) {
  const root = new Group(); root.name = "metro-detailed-interior";
  const minX=-11.10, maxX=bodyEnd-.12, length=maxX-minX, mid=(minX+maxX)/2;
  const yWindow=F+(2.04-F)*METRO_PROFILE.upperHeightFactor, hWindow=1.05*METRO_PROFILE.upperHeightFactor;
  const doorHeight=2.05*METRO_PROFILE.upperHeightFactor;
  box(root,"cabin-floor-slab",[length,.09,WALL*2],[mid,F-.045,0],palette.roof);
  const floor = new PlaneGeometry(length,WALL*2); floor.rotateX(-Math.PI/2);
  const positions=floor.getAttribute("position"), uv=floor.getAttribute("uv");
  for(let i=0;i<uv.count;i++) uv.setXY(i,positions.getX(i)/2,positions.getZ(i)/2);
  floor.computeTangents();
  add(root,"cabin-speckled-floor",floor,palette.floor,[mid,F+.001,0]);
  // Delicate edge strips give the floor an intentional construction and scale.
  for(const side of [-1,1]) {
    box(root,"floor-edge-extrusion",[length,.055,.045],[mid,F+.028,side*(WALL-.035)],palette.steel,.012);
    box(root,"floor-border",[length,.003,.13],[mid,F+.004,side*(WALL-.17)],palette.line);
  }

  for(const side of [-1,1]) {
    const lining=rounded(minX,F+.08,length,C-F-.1,.06);
    for(const x of doors) cut(lining,x-.67,F-.025,1.34,doorHeight+.055,.06);
    for(const {x,w} of windows) cut(lining,x-w/2-.025,yWindow-.025,w+.05,hWindow+.05,.12);
    plate(root,"ivory-wall-lining",lining,side*WALL,palette.interior,.045);
    box(root,"wall-upper-trim",[length,.055,.025],[mid,C-.14,side*(WALL-.028)],palette.joint,.012);
    for(const [windowIndex,{x,w}] of windows.entries()) {
      const bezel=rounded(x-w/2-.075,yWindow-.075,w+.15,hWindow+.15,.15);
      cut(bezel,x-w/2-.015,yWindow-.015,w+.03,hWindow+.03,.10);
      plate(root,"deep-window-bezel",bezel,side*(WALL-.023),palette.roof,.07);
      const gasket=rounded(x-w/2-.027,yWindow-.027,w+.054,hWindow+.054,.115);
      cut(gasket,x-w/2+.01,yWindow+.01,w-.02,hWindow-.02,.09);
      plate(root,"inner-window-gasket",gasket,side*(WALL-.065),palette.rubber,.014);
      box(root,"window-sill",[w+.14,.055,.115],[x,yWindow-.045,side*(WALL-.038)],palette.interior,.02);
      // Four individual shells and narrow joins replace a single rectangular bench.
      for(let i=0;i<4;i++) seat(root,x-w/2+(i+.5)*w/4,w/4,side,palette,windowIndex===windows.length-1&&side===1&&i===3);
      for(const direction of [-1,1]) {
        const end=x+direction*(w/2+.09);
        box(root,"seat-end-partition",[.035,.96,.50],[end,F+.78,side*(WALL-.22)],palette.glass,.017);
        rod(root,"seat-end-grab",[end,F+.42,side*(WALL-.51)],[end,F+1.40,side*(WALL-.51)],.018,palette.steel);
        rod(root,"armrest",[end,F+.68,side*(WALL-.49)],[end,F+.71,side*(WALL-.08)],.019,palette.steel);
      }
      box(root,"wall-service-seam",[.007,.28,.006],[x,F+1.01,side*(WALL-.027)],palette.joint);
      box(root,"wall-service-seam",[w,.007,.006],[x,F+1.04,side*(WALL-.027)],palette.joint);
    }

    for(const [index,x] of doors.entries()) {
      for(const dx of [-.735,.735]) {
        box(root,"door-inner-jamb",[.095,doorHeight+.035,.085],[x+dx,F+doorHeight/2,side*(WALL-.04)],palette.roof,.025);
        rod(root,"door-side-handrail",[x+dx,F+.12,side*(WALL-.21)],[x+dx,F+2.18,side*(WALL-.21)],.018,palette.steel);
        for(const y of [F+.17,F+2.12]) rod(root,"grab-mount",[x+dx,y,side*(WALL-.21)],[x+dx,y,side*(WALL+.015)],.022,palette.steel);
      }
      box(root,"door-operator-housing",[1.72,.21,.16],[x,C-.15,side*(WALL-.03)],palette.interior,.055);
      box(root,"door-header-gasket",[1.44,.018,.025],[x,F+doorHeight+.015,side*(WALL-.09)],palette.rubber,.007);
      box(root,"door-status-light",[.32,.025,.013],[x,C-.07,side*(WALL-.119)],palette.line,.01);
      box(root,"door-route-display",[1.20,.125,.022],[x,C-.175,side*(WALL-.12)],palette.screen,.023);
      // A miniature route strip uses physical illuminated stops, legible at gameplay scale.
      box(root,"route-line",[.95,.012,.009],[x,C-.17,side*(WALL-.136)],palette.line);
      for(let stop=0;stop<7;stop++) {
        const dot=add(root,"route-stop",new CylinderGeometry(.018,.018,.009,10),stop===index%7?palette.amber:palette.light,[x-.46+stop*.153,C-.17,side*(WALL-.143)]); dot.rotation.x=Math.PI/2;
      }
      box(root,"door-threshold",[1.34,.028,.24],[x,F-.008,side*(WALL+.04)],palette.steel,.008);
      for(let j=0;j<12;j++) box(root,"threshold-flute",[1.26,.002,.006],[x,F+.008,side*(WALL-.06+j*.014)],palette.joint);
      box(root,"door-warning-base",[1.3,.003,.07],[x,F+.005,side*(WALL-.19)],palette.amber);
      for(let j=0;j<10;j++) {
        const stripe=box(root,"door-warning-stripe",[.055,.003,.069],[x-.57+j*.126,F+.007,side*(WALL-.19)],palette.rubber); stripe.rotation.y=.3;
      }
      if(index===1 || index===3) {
        box(root,"passenger-intercom",[.135,.245,.035],[x-.86,F+1.25,side*(WALL-.045)],palette.roof,.023);
        box(root,"intercom-emergency-button",[.055,.055,.018],[x-.86,F+1.20,side*(WALL-.072)],palette.red,.02);
        for(let j=0;j<4;j++) box(root,"intercom-grille",[.075,.004,.009],[x-.86,F+1.29+j*.012,side*(WALL-.068)],palette.rubber);
      }
    }

    const railY=C-.24, railZ=side*.93;
    rod(root,"overhead-rail",[minX+.35,railY,railZ],[maxX-.2,railY,railZ],.02,palette.steel);
    for(let x=minX+.5;x<maxX-.1;x+=1.06) {
      rod(root,"rail-ceiling-bracket",[x,railY,railZ],[x,C-.055,railZ],.016,palette.steel);
      rod(root,"strap-webbing",[x,railY,railZ],[x,F+2.13,railZ],.013,palette.rubber);
      const handle=new Shape();
      handle.moveTo(-.035,.175); handle.quadraticCurveTo(0,.21,.035,.175); handle.lineTo(.11,.035); handle.quadraticCurveTo(.12,0,.075,-.006);
      handle.lineTo(-.075,-.006); handle.quadraticCurveTo(-.12,0,-.11,.035); handle.closePath();
      const hole=new Path(); hole.moveTo(-.025,.138); hole.lineTo(-.075,.035); hole.lineTo(.075,.035); hole.lineTo(.025,.138); hole.closePath(); handle.holes.push(hole);
      add(root,"triangular-grab-handle",new ExtrudeGeometry(handle,{depth:.022,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:1,curveSegments:4}),palette.interior,[x,F+1.93,railZ-.011]);
    }
  }

  // Segmented roof panels, recessed twin light strips and real louvres.
  const panels=Math.ceil(length/1.65), panelLength=length/panels;
  for(let i=0;i<panels;i++) {
    const x=minX+(i+.5)*panelLength;
    box(root,"ceiling-panel",[panelLength-.014,.04,2.84],[x,C+.018,0],palette.interior,.014);
    box(root,"ceiling-joint",[.006,.012,2.9],[x-panelLength/2,C-.004,0],palette.joint);
    for(const side of [-1,1]) {
      box(root,"recessed-light-channel",[panelLength-.075,.052,.17],[x,C-.02,side*.70],palette.roof,.02);
      box(root,"diffused-ceiling-light",[panelLength-.15,.016,.095],[x,C-.05,side*.70],palette.light,.007);
      box(root,"vent-channel",[panelLength-.08,.014,.22],[x,C-.013,side*1.30],palette.joint);
      for(let j=0;j<13;j++) box(root,"vent-louvre",[.016,.018,.19],[x-panelLength*.43+j*panelLength*.072,C-.027,side*1.30],palette.interior);
    }
  }
  for(const x of doors) {
    rod(root,"centre-pole",[x,F+.025,0],[x,C-.08,0],.021,palette.steel);
    for(const y of [F+.025,C-.08]) add(root,"pole-flange",new CylinderGeometry(.052,.052,.02,16),palette.steel,[x,y,0]);
    for(const z of [-.93,.93]) rod(root,"pole-branch",[x,C-.32,0],[x,C-.24,z],.018,palette.steel);
  }
  if(bodyEnd<10) {
    // Layered driver's partition replaces the blank vanishing-point wall.
    const end=bodyEnd-.12;
    box(root,"cab-door-surround",[.055,2.25,1.02],[end,F+1.13,0],palette.roof,.06);
    box(root,"cab-door-gasket",[.024,2.17,.91],[end-.04,F+1.12,0],palette.rubber,.045);
    box(root,"cab-access-door",[.023,2.10,.84],[end-.06,F+1.12,0],palette.interior,.04);
    box(root,"cab-door-window-bezel",[.025,.71,.55],[end-.08,F+1.58,0],palette.rubber,.07);
    box(root,"cab-door-window",[.014,.62,.46],[end-.10,F+1.58,0],palette.screen,.065);
    box(root,"cab-door-kick-plate",[.014,.37,.76],[end-.083,F+.28,0],palette.steel,.015);
    rod(root,"cab-door-handle",[end-.12,F+.94,.30],[end-.12,F+1.12,.30],.017,palette.steel);
    box(root,"car-number-display",[.03,.16,.82],[end-.045,F+2.39,0],palette.screen,.04);
    for(const y of [F+2.345,F+2.435]) box(root,"car-number-stroke",[.009,.012,.08],[end-.064,y,-.11],palette.light,.004);
    for(const direction of [-1,1]) box(root,"car-number-stroke",[.009,.08,.012],[end-.064,F+2.39,-.11+direction*.04],palette.light,.004);
    box(root,"car-number-stroke",[.009,.10,.014],[end-.064,F+2.39,.10],palette.light,.004);
    for(const side of [-1,1]) {
      box(root,"end-equipment-cabinet",[.055,1.14,.42],[end-.015,F+.59,side*1.30],palette.interior,.03);
      box(root,"end-equipment-reveal",[.01,.003,.37],[end-.049,F+.91,side*1.30],palette.joint);
      rod(root,"equipment-door-latch",[end-.065,F+.62,side*1.39],[end-.065,F+.72,side*1.39],.012,palette.steel);
      box(root,"emergency-equipment-mark",[.012,.09,.09],[end-.05,F+1.02,side*1.30],palette.red,.02);
      for(let i=0;i<7;i++) box(root,"equipment-vent",[.01,.011,.25],[end-.05,F+.15+i*.026,side*1.30],palette.joint);
      const x=bodyEnd-.95;
      box(root,"passenger-screen-housing",[1.42,.58,.07],[x,F+1.73,side*(WALL-.065)],palette.roof,.065);
      box(root,"passenger-screen",[1.30,.46,.015],[x,F+1.73,side*(WALL-.109)],palette.screen,.04);
      box(root,"screen-route",[1.06,.018,.012],[x,F+1.69,side*(WALL-.122)],palette.line,.008);
      for(let i=0;i<6;i++) {
        const dot=add(root,"screen-stop",new CylinderGeometry(.025,.025,.01,12),i===4?palette.amber:palette.light,[x-.52+i*.208,F+1.69,side*(WALL-.132)]);dot.rotation.x=Math.PI/2;
      }
      box(root,"screen-heading",[.57,.035,.01],[x-.23,F+1.85,side*(WALL-.128)],palette.light,.007);
      box(root,"screen-subheading",[.36,.012,.01],[x-.335,F+1.79,side*(WALL-.128)],palette.line);
    }
  }
  anchor(root,"cabin-seat-top",[windows[0].x,F+METRO_PROFILE.seatHeight,WALL-.5]);
  anchor(root,"cabin-ceiling",[0,C,0]);
  anchor(root,"cabin-aisle-edge",[0,F,WALL-.56]);
  return root;
}
