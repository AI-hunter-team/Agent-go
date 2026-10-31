import { LOUNGE_JOIN } from "./loungeLayout";
import { CONNECTOR_SLAB_DEPTH } from "../../shared/connectorGeometry";
import { CatmullRomCurve3, ExtrudeGeometry, Mesh, MeshStandardMaterial, Shape, TubeGeometry, Vector3 } from "three";
import type { WorldDefinition, EntranceDefinition } from "../../shared/world";
import { createMetroCar, metroMaterials, METRO } from "../../assets/metro-train";
import { worldTrainLayout } from "../../shared/generatedTrain";
export { generatedTrainLayout } from "../../shared/generatedTrain";
import type { GeneratedPalette } from "./generatedSurfaces";
import { SurfaceBuilder, disposeSurfaceGeometry, type XYZ } from "./surfaceGeometry";

/** A thin closed stair slab, stone nosings and actual anti-slip inserts. Local +X descends. */
export function stairFlight(p: GeneratedPalette, run: number, drop: number, width: number, count: number, escalator = false) {
  const b = new SurfaceBuilder(), going = run / count, rise = drop / count;
  const profile = new Shape(); profile.moveTo(0, -rise - .035);
  for (let i = 0; i < count; i++) {
    profile.lineTo((i + 1) * going, -(i + 1) * rise - .035);
    if (i < count - 1) profile.lineTo((i + 1) * going, -(i + 2) * rise - .035);
  }
  profile.lineTo(run, -drop - CONNECTOR_SLAB_DEPTH); profile.lineTo(0, -CONNECTOR_SLAB_DEPTH); profile.closePath();
  const slab = new ExtrudeGeometry(profile, { depth: width, bevelEnabled: false }); slab.translate(0, 0, -width / 2); b.add(escalator ? p.dark : p.concrete, slab);
  for (let i = 0; i < count; i++) {
    const x = (i + .5) * going, y = -(i + 1) * rise;
    b.box(escalator ? p.ribbed : p.stone, [going, .035, width], [x, y - .0175, 0]);
    if (escalator) {
      b.box(p.paint, [.02, .008, width], [(i + 1) * going - .015, y + .002, 0]);
      for (const s of [-1, 1]) b.box(p.tactile, [going, .009, .025], [x, y + .003, s * (width / 2 - .02)]);
    } else for (const offset of [.045, .075]) b.box(p.rubber, [.008, .003, width - .16], [(i + 1) * going - offset, y + .001, 0]);
  }
  const slope = -Math.atan2(drop, run), diagonal = Math.hypot(run, drop);
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + (escalator ? -.03 : .04));
    if (escalator) {
      b.box(p.steel, [diagonal, .32, .16], [run / 2, -drop / 2 + .16, z], slope);
      b.box(p.glass, [diagonal, .65, .035], [run / 2, -drop / 2 + .61, z], slope);
      // Rounded return loops, rubber belt above a brushed steel/glass balustrade.
      const curve = new CatmullRomCurve3([new Vector3(-.35, .68, z), new Vector3(-.32, .98, z), new Vector3(.2, 1.02, z), new Vector3(run - .2, -drop + 1.02, z), new Vector3(run + .32, -drop + .98, z), new Vector3(run + .35, -drop + .68, z), new Vector3(run - .1, -drop + .58, z), new Vector3(.1, .58, z)], true, "centripetal");
      b.add(p.rubber, new TubeGeometry(curve, 72, .052, 6, true));
    } else {
      b.bar(p.steel, [0, .98, z], [run, -drop + .98, z], .035);
      b.box(p.glass, [diagonal, .65, .025], [run / 2, -drop / 2 + .53, z], slope);
      for (let i = 0; i <= count; i += Math.max(1, Math.round(count / 6))) {
        const x = i * going, y = -i * rise;
        b.bar(p.steel, [x, y, z], [x, y + .98, z], .025); b.box(p.steel, [.14, .035, .14], [x, y + .015, z]);
      }
    }
  }
  if (escalator) for (const [x, y] of [[-.35, 0], [run + .35, -drop]]) {
    b.box(p.ribbed, [.7, .045, width], [x, y - .025, 0]);
    b.box(p.tactile, [.06, .012, width], [x + (x < 0 ? .3 : -.3), y + .003, 0]);
  }
  const root = b.finish(escalator ? "detailed-escalator" : "detailed-stairs");
  root.userData = { run, drop, width, count, rise, going, upper: [0, 0, 0], lower: [run, -drop, 0], antiSlip: !escalator, closedSlab: true };
  return root;
}

export function texturedMetroMaterials(p: GeneratedPalette) {
  const trainMaterials = metroMaterials();
  for (const [key, material] of Object.entries(trainMaterials)) {
    const source = key === "floor" ? p.stone : key === "rubber" || key === "chassis" ? p.rubber : key === "shell" || key === "line" || key === "seat" ? p.paint : p.steel;
    if (!["glass", "windshield", "light", "red", "amber"].includes(key)) {
      material.map = source.map; material.normalMap = source.normalMap; material.roughnessMap = source.roughnessMap; material.normalScale.copy(source.normalScale); material.userData.metres = source.userData.metres;
    }
  }
  return trainMaterials;
}

export function createGeneratedPlatform(d: WorldDefinition, p: GeneratedPalette, openFront = false) {
  const side = d.layout.platformAxis?.direction === "y", length = side ? d.layout.HEIGHT : d.layout.WIDTH;
  const centre = d.layout.platformAxis?.center ?? d.layout.HEIGHT / 2, b = new SurfaceBuilder(), layout = worldTrainLayout(d);
  b.box(p.stone, [length, .28, 14], [length / 2, -.14, 0]);
  for (const direction of [-1, 1]) {
    const track = direction * layout.trackCentre;
    b.box(p.tactile, [length - .5, .022, .34], [length / 2, .012, direction * 6.48]);
    b.box(p.stone, [length, .18, .24], [length / 2, -.07, direction * 6.89]);
    b.box(p.dark, [length + 4, .2, 4.4], [length / 2, -1.49, track]);
    if(!(openFront&&direction===1)){
    b.box(p.concrete, [length + 4, 5.6, .25], [length / 2, 1.15, direction * 11.1]);
    b.box(p.sage, [length, 1, .04], [length / 2, .58, direction * 10.95]);
    }
    for (const offset of [-.8, .8]) {
      b.box(p.steel, [length + 4, .075, .065], [length / 2, layout.railTop - .0375, track + offset]);
      b.box(p.dark, [length + 4, .09, .045], [length / 2, layout.railTop - .12, track + offset]);
      b.box(p.steel, [length + 4, .025, .15], [length / 2, layout.railTop - .175, track + offset]);
    }
    for (let x = -1.5; x < length + 2; x += .65) {
      b.box(p.concrete, [.22, .13, 2.45], [x, -1.36, track]);
      for (const z of [-.8, .8]) for (const s of [-1, 1]) b.box(p.rubber, [.16, .035, .06], [x, -1.22, track + z + s * .09]);
    }
    for (const x of [-2, length + 2]) {
      b.box(p.rubber, [.16, 5.4, 4.3], [x, 1.2, track]);
      for (const z of [-2.05, 2.05]) b.box(p.concrete, [.5, 5.4, .18], [x, 1.2, track + z]);
      b.box(p.concrete, [.5, .25, 4.4], [x, 3.84, track]);
    }
    if(!(openFront&&direction===1)){
    // Cable run and repeated access brackets belong on the track wall.
    b.box(p.steel, [length, .12, .14], [length / 2, 2.65, direction * 10.87]);
    for (let x = 4; x < length; x += 6) b.box(p.steel, [.09, .65, .15], [x, 2.42, direction * 10.82]);
    }
  }
  const root = b.finish("generated-platform-textured");
  root.position.set(...(side ? [centre, -6, 0] : [0, -6, centre]) as XYZ); root.rotation.y = side ? -Math.PI / 2 : 0;
  const trainMaterials = texturedMetroMaterials(p), train = new SurfaceBuilder();
  for (const direction of [-1, 1]) layout.centres.forEach((x, i) => {
    const kind = i === 0 || i === layout.count - 1 ? "head" : "trailer", car = createMetroCar(kind, trainMaterials);
    // Pose the platform-facing doors open before static batching.
    const platformSide = i === 0 ? direction : -direction;
    car.traverse(node => {
      if (node.userData.role === "metroDoor" && node.userData.side === platformSide)
        node.position.x = Number(node.userData.closedX) + Number(node.userData.travel);
    });
    car.position.set(x, layout.railTop, direction * layout.trackCentre); car.rotation.y = i === 0 ? Math.PI : 0; car.updateMatrixWorld(true);
    // The detailed cabin introduces two near-equivalent materials. Batch those
    // into existing steel/line surfaces so two trains retain the draw-call budget.
    car.traverse(node => {
      if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
      const material = node.material === trainMaterials.joint ? trainMaterials.steel : node.material === trainMaterials.screen ? trainMaterials.line : node.material;
      train.add(material, node.geometry.clone(), node.matrixWorld);
    });
    disposeSurfaceGeometry(car);
  });
  const cars = train.finish("generated-metro-trains"); cars.userData = { ...layout, carsPerTrack: layout.count, units: "metres", passengerFloor: layout.railTop + METRO.floor, materials: "original-metro-plus-PBR" }; root.add(cars);
  // Train mesh/material resources belong to this scene, maps to the generated palette.
  return { root, dispose: () => { disposeSurfaceGeometry(root); Object.values(trainMaterials).forEach(m => m.dispose()); } };
}

export function createEntrancePassage(e: EntranceDefinition, p: GeneratedPalette, overview: boolean, privateDock = false) {
  const b = new SurfaceBuilder(), run = 6, drop = 4;
  b.box(p.sage, [4.5, .2, e.width], [-2.25, 3.9, 0]); b.box(p.sage, [2, .2, e.width], [7, -.1, 0]);
  // Stepped retaining walls/roof follow the same envelope used by camera collision.
  for (let i = 0; i < 24; i++) {
    const x = (i + .5) * run / 24, y = drop * (1 - (i + .5) / 24);
    for (const s of [-1, 1]) {
      b.box(p.wall, [run / 24, 2.8, .18], [x, y + 1.4, s * (e.width / 2 + .09)]);
      b.box(p.sage, [run / 24, .65, .025], [x, y + .33, s * (e.width / 2 - .008)]);
    }
    if (!overview) b.box(p.wall, [run / 24, .15, e.width + .36], [x, y + 2.8, 0]);
  }
  for (const s of [-1, 1]) {
    for (const [x, y, length] of [[-2.25, 4, 4.5], [7, 0, 2]]) {
      const sideDoor = privateDock && s === -1 && x < 0;
      const span = sideDoor ? LOUNGE_JOIN.nearZ : length, centre = sideDoor ? -LOUNGE_JOIN.nearZ/2 : x;
      b.box(p.wall, [span, 2.8, .18], [centre, y + 1.4, s * (e.width / 2 + .09)]);
      b.box(p.sage, [span, .65, .025], [centre, y + .33, s * (e.width / 2 - .008)]);
    }
    b.bar(p.steel, [6, 1.05, s * (e.width / 2 - .13)], [8, 1.05, s * (e.width / 2 - .13)]);
  }
  b.box(p.wall, [.4, .7, e.width + .36], [6, 3.15, 0]);
  b.box(p.rubber, [.15, 2.8, e.width], [-4.5, 5.4, 0]);
  b.box(p.wall, [4.5, .15, e.width + .36], [-2.25, 6.8, 0]);
  if (!overview) b.box(p.wall, [2, .15, e.width + .36], [7, 2.8, 0]);
  for (const x of [-1.5, 1.5, 4.5, 7]) {
    const y = x < 0 ? 4 : x > 6 ? 0 : drop * (1 - x / run);
    b.box(p.steel, [.6, .055, 1.85], [x, y + 2.68, 0]); b.box(p.light, [.5, .015, 1.7], [x, y + 2.645, 0]);
  }
  for (const [x, y] of [[-.6, 4], [7, 0]]) b.box(p.tactile, [.4, .022, e.width - .3], [x, y + .012, 0]);
  const root = b.finish(`entry-passage-${e.id}`), flight = stairFlight(p, run, drop, e.width - .22, 24);
  flight.position.y = 4; root.add(flight);
  root.userData = { ...flight.userData, entry: e.id, materials: "textured" }; return root;
}
