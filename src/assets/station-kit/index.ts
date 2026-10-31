import {
  BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial,
  Object3D, QuadraticBezierCurve3, Shape, ShapeGeometry, Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRailingAsset } from "./railing";
import { GATE_CABINET_OFFSET, GATE_CABINET_WIDTH, SECURITY_POST_OFFSET } from "../../sim/facilityGeometry";

export type FacilityState = "open" | "closed" | "broken";
export interface AssetDefinition { id: string; label: string; category: string; description: string; }
export const ASSETS: AssetDefinition[] = [
  { id: "floor-ivory", label: "暖白磨石地面", category: "architecture", description: "3×3m；顶面 Y=0；可平铺。" },
  { id: "floor-sage", label: "鼠尾草绿磨石", category: "architecture", description: "同一地面模型，不同材质皮肤。" },
  { id: "floor-plain", label: "素色地面", category: "architecture", description: "共享漆面；可用于中性区域。" },
  { id: "wall-straight", label: "直墙", category: "architecture", description: "3m 长，3.5m 高，0.4m 厚。" },
  { id: "wall-corner", label: "转角墙", category: "architecture", description: "3×3m 包络的 L 型转角。" },
  { id: "wall-end", label: "墙体端头", category: "architecture", description: "0.4m 方形端头，供局部长度适配。" },
  { id: "portal", label: "门洞模块", category: "architecture", description: "3m 模数；2m 净宽，2.75m 净高。" },
  { id: "pillar", label: "方柱", category: "architecture", description: "2×2m 占地，3.5m 高。" },
  { id: "partition", label: "低隔断", category: "architecture", description: "3m 长，1m 高，0.4m 厚。" },
  { id: "ticket-machine", label: "自动售票机", category: "facility", description: "屏幕、灯带、票口和交互锚点独立。" },
  { id: "security-arch", label: "安检门", category: "facility", description: "2m 净宽、2.5m 高，匹配既有安检通道；状态灯独立。" },
  { id: "fare-gate", label: "检票闸机", category: "facility", description: "双翼分别以铰链为轴，支持独立开合。" },
  { id: "sign-totem", label: "导视立柱", category: "wayfinding", description: "空白信息面板，内容可由地图另行覆盖。" },
  { id: "sign-panel", label: "悬挂标牌", category: "wayfinding", description: "2.8m 横向标牌；编号/文字不烘入模型。" },
  { id: "marking-arrow", label: "导向箭头", category: "wayfinding", description: "独立几何贴花，朝向本地 -Z。" },
  { id: "marking-queue", label: "排队标线", category: "wayfinding", description: "6 个标记，间距0.8m；独立于地面。" },
  { id: "structural-frame", label: "圆角结构框", category: "architecture", description: "6m 跨度、4.2m 高；两倍地面模数。" },
  { id: "ceiling-panel", label: "模块顶板", category: "architecture", description: "3×3m；以底部安装面为参考。" },
  { id: "light-strip", label: "嵌入灯带", category: "architecture", description: "2.2m 灯条；安装平面为 Y=0，发光面向下。" },
  { id: "window-bay", label: "窗墙模块", category: "architecture", description: "3m 窗墙；独立玻璃与窗框。" },
  { id: "route-straight", label: "连续导向直段", category: "wayfinding", description: "3m 长、0.46m 宽的独立地面漆带。" },
  { id: "route-turn", label: "连续导向弯段", category: "wayfinding", description: "3m 模数圆弯；可旋转拼接。" },
  { id: "route-split", label: "连续导向分流", category: "wayfinding", description: "T 型分支；连接三侧模块边中点。" },
  { id: "ceiling-fascia", label: "顶面侧封板", category: "architecture", description: "3m 长、0.7m 高；衔接基础墙与高顶。" },
  { id: "railing-straight", label: "金属栏杆直段", category: "barrier", description: "3m 模数，1.1m 高；横杆与立杆可按间隔重排。" },
  { id: "railing-corner", label: "金属栏杆转角", category: "barrier", description: "1.5×1.5m 的 90° 转角，共用转角柱。" },
  { id: "railing-end", label: "金属栏杆端柱", category: "barrier", description: "0.16m 柱脚，1.1m 高；供收口及连接。" },
];

export function makeMaterials() {
  function material(name: string, hex: string, roughness: number, metalness = 0, mapFamily?: string) {
    const value = new MeshStandardMaterial({ color: hex, roughness, metalness });
    value.name = name;
    value.normalScale.set(0.24, 0.24);
    if (mapFamily) value.userData.maps = {
      color: mapFamily + "-color.png", normal: mapFamily + "-normal.png", roughness: mapFamily + "-roughness.png",
    };
    return value;
  }
  const result = {
    plaster: material("kit.plaster.ivory", "#f2ecdc", 0.94, 0, "plaster"),
    terrazzo: material("kit.terrazzo.ivory", "#e0ddcd", 0.9, 0.04, "terrazzo"),
    sage: material("kit.terrazzo.sage", "#a1ad9d", 0.9, 0.04, "terrazzo"),
    plain: material("kit.paint.ivory", "#e9e5da", 0.85),
    ochre: material("kit.coating.ochre", "#c19447", 0.72, 0.16, "coating"),
    ink: material("kit.coating.charcoal", "#353b38", 0.78, 0.12, "coating"),
    brick: material("kit.paint.brick", "#8e483a", 0.68),
    line: material("kit.paint.line", "#c3bdac", 0.96),
    pale: material("kit.paint.light", "#f8f5eb", 0.82),
    glass: material("kit.flap.frosted-sage", "#a7c8b9", 0.54, 0.05),
    screen: material("kit.screen.ready", "#a7c4dc", 0.4),
    screenOff: material("kit.screen.off", "#444b49", 0.88),
    screenError: material("kit.screen.fault", "#682e27", 0.8),
    open: material("kit.status.open", "#77b5a0", 0.55),
    closed: material("kit.status.closed", "#858b85", 0.9),
    broken: material("kit.status.broken", "#d35a3d", 0.6),
    steel: material("kit.metal.satin", "#a1aaa5", 0.5, 0.7, "coating"),
    ceiling: material("kit.ceiling.ivory", "#e7dfcf", 0.9),
    window: material("kit.window.glass", "#b4cbd1", 0.2, 0.1),
    light: material("kit.light.warm", "#fff2d8", 0.25),
  };
  result.screen.emissive = new Color("#6f91b7"); result.screen.emissiveIntensity = 0.4;
  result.open.emissive = new Color("#386752"); result.open.emissiveIntensity = 0.18;
  result.broken.emissive = new Color("#763020"); result.broken.emissiveIntensity = 0.18;
  result.window.transparent = true; result.window.opacity = 0.23; result.window.depthWrite = false;
  result.light.emissive = new Color("#fff0cf"); result.light.emissiveIntensity = 1;
  result.ceiling.emissive = new Color("#8d7956"); result.ceiling.emissiveIntensity = 0.12;
  result.terrazzo.normalScale.setScalar(0.1); result.sage.normalScale.setScalar(0.1);
  return result;
}
export type KitMaterials = ReturnType<typeof makeMaterials>;
const geometryCache = new Map<string, BufferGeometry>();

function prepareGeometry(input: BufferGeometry) {
  const p = input.getAttribute("position"), n = input.getAttribute("normal"), uv = input.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const u = ax > ay && ax > az ? p.getZ(i) : p.getX(i);
    const v = ay > ax && ay > az ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / 3 + 0.5, v / 3 + 0.5);
  }
  const geometry = mergeVertices(input); geometry.computeTangents(); return geometry;
}

function boxGeometry(w: number, h: number, d: number, bevel = 0.025) {
  const radius = Math.min(bevel, w / 5, h / 5, d / 5);
  const key = [w, h, d, radius].join(":");
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = radius ? new RoundedBoxGeometry(w, h, d, 1, radius) : new BoxGeometry(w, h, d);
    geometry = prepareGeometry(geometry);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

function frameGeometry() {
  const key = "frame6";
  let geometry = geometryCache.get(key);
  if (!geometry) {
    const shape = new Shape(), w = 3, h = 4.2, r = 0.65, t = 0.38, inner = w - t;
    shape.moveTo(-w, 0); shape.lineTo(-w, h - r);
    shape.quadraticCurveTo(-w, h, -w + r, h); shape.lineTo(w - r, h);
    shape.quadraticCurveTo(w, h, w, h - r); shape.lineTo(w, 0);
    shape.lineTo(inner, 0); shape.lineTo(inner, h - r);
    shape.quadraticCurveTo(inner, h - t, w - r, h - t); shape.lineTo(-w + r, h - t);
    shape.quadraticCurveTo(-inner, h - t, -inner, h - r); shape.lineTo(-inner, 0); shape.closePath();
    geometry = new ExtrudeGeometry(shape, { depth: 0.32, steps: 1, curveSegments: 12, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.01, bevelThickness: 0.01 });
    geometry.translate(0, 0, -0.16); geometry = prepareGeometry(geometry);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

function ribbon(points: Vector3[], width = 0.46) {
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const direction = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const side = new Vector3(-direction.z, 0, direction.x).multiplyScalar(width / 2);
    for (const sign of [-1, 1]) {
      const p = points[i].clone().addScaledVector(side, sign); positions.push(p.x, 0.008, p.z); normals.push(0, 1, 0); uv.push((sign + 1) / 2, i / (points.length - 1));
    }
    if (i) { const a = (i - 1) * 2, b = i * 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3)); geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
  return geometry;
}

export function createAsset(id: string, materials: KitMaterials, state: FacilityState = "open") {
  if (!ASSETS.some((asset) => asset.id === id)) throw new Error("Unknown asset: " + id);
  const root = new Group(); root.name = id;
  root.userData = { assetId: id, units: "metres", upAxis: "Y", front: "+Z", state, version: 2 };
  const block = (name: string, size: [number, number, number], pos: [number, number, number], mat: MeshStandardMaterial, parent: Object3D = root, bevel = 0.025) => {
    const mesh = new Mesh(boxGeometry(...size, bevel), mat);
    mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const anchor = (name: string, pos: [number, number, number]) => {
    const node = new Object3D(); node.name = "anchor_" + name; node.position.set(...pos);
    node.userData.role = "anchor"; root.add(node);
  };
  const wall = (w: number, h: number, d: number, x = 0, z = 0) => {
    block("wall_body", [w, h - 0.64, d], [x, 0.22 + (h - 0.64) / 2, z], materials.plaster);
    block("wall_band", [w, 0.42, d], [x, h - 0.21, z], materials.plaster);
    block("wall_plinth", [w, 0.22, d], [x, 0.11, z], materials.ink, root, 0.012);
  };
  const statusLamp = (pos: [number, number, number], size: [number, number, number]) => {
    const lamp = block("status_indicator", size, pos, materials.open);
    lamp.userData.role = "statusIndicator";
  };
  if (id.startsWith("floor-")) {
    root.userData.front = "tile; top=Y0";
    block("tile", [3, 0.12, 3], [0, -0.06, 0], id === "floor-sage" ? materials.sage : id === "floor-plain" ? materials.plain : materials.terrazzo, root, 0.005);
    for (const x of [-1.495, 1.495]) block("seam_x", [0.01, 0.002, 3], [x, 0.001, 0], materials.line, root, 0);
    for (const z of [-1.495, 1.495]) block("seam_z", [3, 0.002, 0.01], [0, 0.001, z], materials.line, root, 0);
  } else if (id === "wall-straight") wall(3, 3.5, 0.4);
  else if (id === "wall-corner") {
    wall(3, 3.5, 0.4, 0, -1.3); wall(0.4, 3.5, 2.6, -1.3, 0.2);
  } else if (id === "wall-end") wall(0.4, 3.5, 0.4);
  else if (id === "portal") {
    wall(0.5, 3.5, 0.4, -1.25); wall(0.5, 3.5, 0.4, 1.25);
    block("lintel", [2, 0.33, 0.4], [0, 2.915, 0], materials.plaster);
    block("lintel_band", [2, 0.42, 0.4], [0, 3.29, 0], materials.plaster);
    anchor("passage", [0, 0, 0]);
  } else if (id === "pillar") {
    wall(2, 3.5, 2);
    block("pillar_accent", [1.96, 2.8, 0.018], [0, 1.82, 1.002], materials.ochre, root, 0);
  } else if (id === "partition") wall(3, 1, 0.4);
  else if (id === "ticket-machine") {
    block("chassis", [0.84, 1.76, 0.62], [0, 0.88, -0.03], materials.ink, root, 0.045);
    block("foot_plinth", [0.85, 0.1, 0.64], [0, 0.05, -0.03], materials.ink);
    block("top_cap", [0.8, 0.08, 0.64], [0, 1.71, -0.02], materials.steel);
    const display = new Group(); display.name = "sloped_console"; display.position.set(0, 1.29, 0.14); display.rotation.x = -0.16; root.add(display);
    block("screen_frame", [0.72, 0.7, 0.09], [0, 0, 0.13], materials.ochre, display);
    block("screen_recess", [0.65, 0.61, 0.02], [0, 0, 0.18], materials.ink, display);
    const screen = block("screen", [0.59, 0.53, 0.014], [0, 0, 0.195], materials.screen, display);
    screen.userData.role = "statusScreen";
    const ui = new Group(); ui.name = "screen_ready_glyphs"; ui.userData.role = "whenOpen"; display.add(ui);
    block("screen_heading", [0.39, 0.026, 0.006], [-0.03, 0.18, 0.206], materials.pale, ui, 0);
    for (let i = 0; i < 3; i++) {
      block("screen_row_" + i, [0.23, 0.022, 0.006], [-0.09, 0.07 - i * 0.08, 0.206], materials.pale, ui, 0);
      block("screen_button_" + i, [0.09, 0.05, 0.006], [0.18, 0.07 - i * 0.08, 0.206], materials.ink, ui, 0);
    }
    block("ticket_shelf", [0.7, 0.12, 0.16], [0, 0.85, 0.33], materials.ochre);
    block("ticket_slot", [0.39, 0.04, 0.012], [-0.08, 0.84, 0.419], materials.ink);
    block("card_reader", [0.13, 0.12, 0.03], [0.23, 0.85, 0.424], materials.glass);
    statusLamp([0, 1.65, 0.315], [0.45, 0.045, 0.018]);
  } else if (id === "security-arch") {
    for (const x of [-SECURITY_POST_OFFSET, SECURITY_POST_OFFSET]) {
      block("scanner_post", [0.22, 2.5, 0.42], [x, 1.25, 0], materials.ink);
      block("scanner_stripe", [0.08, 2.28, 0.015], [x, 1.18, 0.218], materials.ochre);
      for (const y of [0.7, 1.2, 1.7]) block("scanner_sensor", [0.03, 0.08, 0.2], [x + (x > 0 ? -0.12 : 0.12), y, 0], materials.glass);
    }
    block("scanner_header", [2.44, 0.18, 0.42], [0, 2.41, 0], materials.ochre);
    block("scanner_header_insert", [1.9, 0.13, 0.02], [0, 2.41, 0.219], materials.ink);
    statusLamp([0, 2.41, 0.235], [0.25, 0.06, 0.018]);
    anchor("entry", [0, 0, 0.6]); anchor("exit", [0, 0, -1.4]);
  } else if (id === "fare-gate") {
    for (const x of [-GATE_CABINET_OFFSET, GATE_CABINET_OFFSET]) {
      block("gate_cabinet", [GATE_CABINET_WIDTH, 1.06, 1.05], [x, 0.53, 0], materials.ink, root, 0.018);
      block("gate_top", [0.11, 0.05, 0.98], [x, 1.04, 0], materials.plain);
      block("tap_pad", [0.075, 0.026, 0.19], [x, 1.08, 0.22], materials.glass);
      block("gate_front_panel", [0.08, 0.9, 0.02], [x, 0.52, 0.532], materials.steel);
      block("gate_trim", [0.016, 0.85, 0.025], [x - Math.sign(x) * 0.03, 0.53, 0.546], materials.ochre);
    }
    for (const sign of [-1, 1]) {
      const pivot = new Group(); pivot.name = sign < 0 ? "flap_left" : "flap_right";
      pivot.position.set(sign * 0.51, 0.67, 0); pivot.userData = { role: "gateHinge", sign };
      root.add(pivot);
      block("gate_blade", [0.51, 0.46, 0.05], [-sign * 0.255, 0, 0], materials.glass, pivot, 0.02);
    }
    statusLamp([-GATE_CABINET_OFFSET, 0.81, 0.539], [0.08, 0.12, 0.018]);
    anchor("entry", [0, 0, 0.6]); anchor("exit", [0, 0, -1.4]);
  } else if (id === "sign-totem") {
    block("totem_base", [0.6, 0.1, 0.4], [0, 0.05, 0], materials.ochre);
    block("totem_body", [0.47, 2.6, 0.16], [0, 1.4, 0], materials.ink);
    anchor("content", [0, 1.7, 0.086]);
  } else if (id === "sign-panel") {
    block("panel", [2.8, 0.5, 0.12], [0, 0.25, 0], materials.ink);
    block("panel_edge", [2.8, 0.035, 0.125], [0, 0.49, 0], materials.ochre);
    anchor("content", [0, 0.25, 0.065]);
  } else if (id === "marking-arrow") {
    const shape = new Shape();
    shape.moveTo(-0.1, -0.55); shape.lineTo(0.1, -0.55); shape.lineTo(0.1, 0.1);
    shape.lineTo(0.32, 0.1); shape.lineTo(0, 0.55); shape.lineTo(-0.32, 0.1); shape.lineTo(-0.1, 0.1); shape.closePath();
    const mesh = new Mesh(new ShapeGeometry(shape), materials.brick);
    mesh.name = "arrow"; mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.008; root.add(mesh);
    root.userData.front = "-Z";
  } else if (id === "marking-queue") {
    for (let i = 0; i < 6; i++) block("queue_tick", [0.4, 0.008, 0.035], [0, 0.008, i * 0.8], materials.ochre, root, 0);
    root.userData.front = "-Z";
  } else if (id === "structural-frame") {
    const frame = new Mesh(frameGeometry(), materials.ochre); frame.name = "rounded_arch_frame";
    frame.castShadow = true; frame.receiveShadow = true; root.add(frame);
  } else if (id === "ceiling-panel") {
    root.userData.mount = "ceiling";
    block("ceiling_slab", [3, 0.12, 3], [0, 0.06, 0], materials.ceiling, root, 0.006);
    for (const x of [-1.495, 1.495]) block("ceiling_joint", [0.01, 0.008, 3], [x, -0.002, 0], materials.line, root, 0);
    for (const z of [-1.495, 1.495]) block("ceiling_joint", [3, 0.008, 0.01], [0, -0.002, z], materials.line, root, 0);
  } else if (id === "ceiling-fascia") {
    block("fascia_panel", [3, 0.7, 0.4], [0, 0.35, 0], materials.plaster);
  } else if (id === "light-strip") {
    root.userData.mount = "ceiling";
    block("light_recess", [0.16, 0.045, 2.2], [0, 0.015, 0], materials.ceiling);
    const light = block("light_diffuser", [0.11, 0.012, 2.12], [0, -0.015, 0], materials.light);
    light.userData.noShadow = true; light.castShadow = false;
  } else if (id === "window-bay") {
    block("window_sill_wall", [3, 1.05, 0.4], [0, 0.525, 0], materials.plaster);
    block("window_plinth", [3, 0.18, 0.41], [0, 0.09, 0], materials.ink);
    for (const x of [-1.43, 1.43]) block("window_pier", [0.14, 2.45, 0.4], [x, 2.275, 0], materials.plaster);
    block("window_header", [3, 0.14, 0.4], [0, 3.43, 0], materials.plaster);
    const pane = block("window_glass", [2.72, 2.25, 0.012], [0, 2.2, 0], materials.window, root, 0);
    pane.userData.noShadow = true; pane.castShadow = false;
    for (const x of [-1.35, -0.45, 0.45, 1.35]) block("window_mullion", [0.035, 2.29, 0.06], [x, 2.2, 0.02], materials.steel);
    for (const y of [1.07, 2.2, 3.33]) block("window_transom", [2.72, 0.035, 0.06], [0, y, 0.02], materials.steel);
  } else if (id.startsWith("railing-")) {
    root.add(createRailingAsset(id, materials));
  } else if (id.startsWith("route-")) {
    const lines: Vector3[][] = [];
    if (id === "route-straight") lines.push([new Vector3(0, 0, 1.5), new Vector3(0, 0, -1.5)]);
    else if (id === "route-turn") lines.push(new QuadraticBezierCurve3(new Vector3(0, 0, 1.5), new Vector3(0, 0, 0), new Vector3(1.5, 0, 0)).getPoints(24));
    else {
      lines.push([new Vector3(0, 0, 1.5), new Vector3(0, 0, 0)]);
      lines.push([new Vector3(-1.5, 0, 0), new Vector3(1.5, 0, 0)]);
    }
    for (const points of lines) { const mesh = new Mesh(ribbon(points), materials.brick); mesh.name = "paint_band"; root.add(mesh); }
    root.userData.front = "-Z";
  }
  if (["ticket-machine", "security-arch", "fare-gate"].includes(id)) {
    anchor("interaction", [0, 0, 0.6]);
    root.userData.kind = id === "ticket-machine" ? "tvm" : id === "security-arch" ? "security" : "gate";
  }
  setFacilityState(root, state, materials);
  return root;
}

export function setFacilityState(root: Object3D, state: FacilityState, materials: KitMaterials) {
  root.userData.state = state;
  root.traverse((node) => {
    if (node instanceof Mesh && node.userData.role === "statusIndicator") node.material = materials[state];
    if (node instanceof Mesh && node.userData.role === "statusScreen") {
      node.material = state === "open" ? materials.screen : state === "closed" ? materials.screenOff : materials.screenError;
    }
    if (node.userData.role === "whenOpen") node.scale.setScalar(state === "open" ? 1 : 0);
  });
}

export function setGateProgress(root: Object3D, progress: number) {
  const amount = Math.max(0, Math.min(1, progress));
  root.traverse((node) => {
    if (node.userData.role === "gateHinge") node.rotation.y = Number(node.userData.sign) * amount * Math.PI * 0.48;
  });
}
