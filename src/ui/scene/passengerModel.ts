import {
  BufferGeometry, Color, Euler, Float32BufferAttribute, Group, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry,
  CatmullRomCurve3, LatheGeometry, Vector2, Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { passengerAppearance, passengerPalette as palette, type CrowdKind } from "./passengerAppearance";
import type { Motion } from "../presentation";

type Vec3 = [number, number, number];
type Part = "body" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "accessory";
type Look = ReturnType<typeof passengerAppearance>;
const unitSphere = new SphereGeometry(1, 12, 8);
const cloth = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, flatShading: true });
const templates = new Map<string, Record<Part, BufferGeometry>>();
const ink = "#30353d", ivory = "#fff8ec", sole = "#e8e6dc";

/** 同一刚性部件的五官、缝线和衣物合为一个顶点色网格，共享材质。 */
class Sculpt {
  private pieces: BufferGeometry[] = [];
  shape(geometry: BufferGeometry, color: string, position: Vec3, scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]) {
    if (!geometry.index) { const indexed = mergeVertices(geometry); geometry.dispose(); geometry = indexed; }
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)));
    const tint = new Color(color), count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) tint.toArray(colors, i * 3);
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    this.pieces.push(geometry);
  }
  oval(color: string, position: Vec3, scale: Vec3, rotation?: Vec3) { this.shape(unitSphere.clone(), color, position, scale, rotation); }
  box(color: string, position: Vec3, size: Vec3, radius = 0.012, rotation?: Vec3) {
    this.shape(new RoundedBoxGeometry(...size, 1, Math.min(radius, 0.018, ...size.map(n => n / 2))), color, position, undefined, rotation);
  }
  /** 八边截面分段塑形：正面、侧面与倒角分开，轮廓不依赖椭球堆叠。 */
  column(color: string, rings: Vec3[], position: Vec3 = [0, 0, 0], rotation?: Vec3) {
    const corners = [[1, 0.62], [0.62, 1], [-0.62, 1], [-1, 0.62], [-1, -0.62], [-0.62, -1], [0.62, -1], [1, -0.62]];
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let r = 0; r < rings.length; r++) for (let i = 0; i < 8; i++) {
      const [y, width, depth] = rings[r]; positions.push(corners[i][0] * width, y, corners[i][1] * depth); uv.push(i / 8, r / (rings.length - 1));
      if (r) {
        const a = (r - 1) * 8 + i, b = (r - 1) * 8 + (i + 1) % 8, c = r * 8 + i, d = r * 8 + (i + 1) % 8;
        indices.push(a, c, b, b, c, d);
      }
    }
    for (let i = 1; i < 7; i++) { indices.push(0, i, i + 1); const end = (rings.length - 1) * 8; indices.push(end, end + i + 1, end + i); }
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    this.shape(geometry, color, position, undefined, rotation);
  }
  lock(color: string, position: Vec3, size: Vec3, rotation?: Vec3) {
    const [x, y, z] = size;
    this.column(color, [[-y, x * 0.36, z * 0.38], [-y * 0.32, x, z], [y * 0.65, x * 0.88, z * 0.8], [y, x * 0.42, z * 0.35]], position, rotation);
  }
  line(color: string, points: Vec3[], radius = 0.008) {
    this.shape(new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), 12, radius, 5, false), color, [0, 0, 0]);
  }
  flare(color: string, profile: [number, number][], depth = 0.70) {
    this.shape(new LatheGeometry(profile.map(p => new Vector2(...p)), 12), color, [0, 0, 0], [1, 1, depth]);
  }
  finish() {
    const result = this.pieces.length ? mergeGeometries(this.pieces, false)! : new BufferGeometry();
    for (const geometry of this.pieces) geometry.dispose();
    return result;
  }
}

/** 发型/脸型独立于行为类型；老人沿用同一造型并改用银发。 */
function sculptHead(look: Look, kind: CrowdKind) {
  const head = new Sculpt(), female = look.gender === "female";
  head.column(look.skin, [[-0.265, female ? 0.105 : 0.13, 0.10], [-0.22, female ? 0.16 : 0.19, 0.15], [-0.11, female ? 0.218 : 0.23, 0.202], [0.105, female ? 0.226 : 0.24, 0.205], [0.21, 0.20, 0.18], [0.265, 0.12, 0.105]]);
  for (const side of [-1, 1]) {
    head.oval(look.skin, [side * 0.23, -0.015, -0.01], [0.039, 0.065, 0.043]);
    head.oval(palette.blush, [side * 0.247, -0.015, 0.014], [0.016, 0.03, 0.018]);
    head.oval(ink, [side * 0.083, 0.005, 0.207], [female ? 0.020 : 0.019, female ? 0.027 : 0.024, 0.010]);
    head.oval(ivory, [side * 0.083 - 0.005, 0.016, 0.215], [0.006, 0.008, 0.004]);
    head.oval(palette.blush, [side * 0.14, -0.061, 0.203], [0.024, 0.009, 0.004], [0, side * 0.2, 0]);
    head.line(look.hair, [[side * 0.058, 0.076, 0.205], [side * 0.082, 0.083, 0.204], [side * 0.108, 0.073, 0.194]], female ? 0.007 : 0.011);
    if (female) {
      head.line(ink, [[side * 0.095, 0.025, 0.213], [side * 0.111, 0.035, 0.207], [side * 0.119, 0.042, 0.2]], 0.005);
      if (look.style === 6 || look.style === 7) head.oval(palette.apricot, [side * 0.247, -0.074, 0.017], [0.014, 0.025, 0.014]);
    }
  }
  head.oval(look.skin, [0, -0.031, 0.217], [female ? 0.025 : 0.032, 0.034, female ? 0.026 : 0.032]);
  head.line(female ? "#b17470" : "#935f53", [[-0.037, -0.093, 0.20], [0, -0.103, 0.209], [0.037, -0.093, 0.20]], 0.006);
  head.column(look.hair, [[look.hairStyle === "crop" ? 0.13 : 0.10, 0.253, 0.23], [0.215, 0.22, 0.20], [0.29, 0.145, 0.13], [0.305, 0.06, 0.06]], [0, 0, -0.004]);
  head.column(look.hair, [[-0.17, 0.17, 0.065], [0.04, 0.232, 0.105], [0.21, 0.17, 0.07]], [0, 0, -0.13]);
  switch (look.hairStyle) {
    case "crop":
      for (const side of [-1, 1]) head.oval(look.hair, [side * 0.211, 0.075, -0.008], [0.025, 0.067, 0.11]);
      break;
    case "sidePart":
      for (let i = 0; i < 3; i++) head.lock(look.hair, [-0.115 + i * 0.085, 0.18 + i * 0.024, 0.19], [0.075, 0.055, 0.065], [0, 0, -0.65]);
      head.line("#ffffff", [[-0.125, 0.21, 0.127], [-0.14, 0.25, 0.05], [-0.14, 0.254, -0.035]], 0.003);
      break;
    case "curls":
      for (let i = 0; i < 7; i++) {
        const angle = i / 6 * Math.PI;
        head.lock(look.hair, [Math.cos(angle) * 0.18, 0.15 + Math.sin(angle) * 0.12, 0.18], [0.064, 0.058, 0.065], [0, 0, Math.cos(angle) * 0.4]);
      }
      break;
    case "quiff":
      for (let i = 0; i < 3; i++) head.lock(look.hair, [-0.11 + i * 0.08, 0.235 + i * 0.014, 0.17], [0.068, 0.075, 0.068], [0, 0, -0.5]);
      break;
    case "bob":
      head.column(look.hair, [[-0.32, 0.215, 0.10], [-0.05, 0.238, 0.12], [0.20, 0.18, 0.07]], [0, 0, -0.13]);
      for (const side of [-1, 1]) head.lock(look.hair, [side * 0.204, -0.095, -0.035], [0.048, 0.22, 0.10]);
      for (let i = 0; i < 4; i++) head.lock(look.hair, [-0.13 + i * 0.085, 0.144, 0.20], [0.053, 0.038, 0.04]);
      break;
    case "ponytail":
      head.lock(look.hair, [0.18, -0.13, -0.12], [0.055, 0.27, 0.07], [0, 0, 0.10]);
      head.oval(look.accent, [0.17, 0.09, -0.12], [0.06, 0.024, 0.08]);
      head.lock(look.hair, [-0.09, 0.18, 0.19], [0.11, 0.05, 0.055], [0, 0, 0.7]);
      break;
    case "bun":
      head.oval(look.hair, [-0.13, 0.265, -0.10], [0.09, 0.065, 0.085]);
      head.oval(look.accent, [-0.13, 0.23, -0.10], [0.092, 0.018, 0.086]);
      head.lock(look.hair, [0.07, 0.18, 0.19], [0.12, 0.05, 0.055], [0, 0, -0.7]);
      break;
    case "waves":
      head.column(look.hair, [[-0.46, 0.185, 0.085], [-0.20, 0.23, 0.105], [0.05, 0.232, 0.105], [0.20, 0.18, 0.07]], [0, 0, -0.14]);
      for (const side of [-1, 1]) head.lock(look.hair, [side * 0.205, -0.17, -0.03], [0.05, 0.29, 0.085], [0, 0, side * -0.06]);
      head.lock(look.hair, [0.055, 0.18, 0.19], [0.14, 0.05, 0.055], [0, 0, -0.8]);
      break;
  }
  if (!female && (look.style === 3 || (kind === "elderly" && look.style === 2))) {
    for (const side of [-1, 1]) head.oval(look.hair, [side * 0.024, -0.075, 0.211], [0.03, 0.016, 0.013], [0, 0, side * -0.2]);
  }
  if (look.glasses) {
    for (const side of [-1, 1]) {
      head.shape(new TorusGeometry(0.052, 0.007, 5, 20), palette.chestnut, [side * 0.083, 0.005, 0.222]);
      head.line(palette.chestnut, [[side * 0.135, 0.005, 0.222], [side * 0.20, 0.012, 0.156], [side * 0.231, 0.025, 0.015]], 0.007);
    }
    head.line(palette.chestnut, [[-0.031, 0.009, 0.224], [0, 0.02, 0.238], [0.031, 0.009, 0.224]], 0.007);
  }
  if (kind === "hurried") {
    head.line(look.accent, [[-0.24, -0.01, 0], [-0.24, 0.19, 0], [0, 0.308, 0], [0.24, 0.19, 0], [0.24, -0.01, 0]], 0.017);
    for (const side of [-1, 1]) {
      head.oval(look.accent, [side * 0.251, -0.01, 0], [0.035, 0.073, 0.062]);
      head.oval(look.coat, [side * 0.277, -0.01, 0], [0.014, 0.046, 0.041]);
    }
  }
  return head;
}

function sculptPassenger(kind: CrowdKind, id: string): Record<Part, BufferGeometry> {
  const look = passengerAppearance(kind, id);
  const female = look.gender === "female";
  const body = new Sculpt(), head = sculptHead(look, kind), arm = new Sculpt(), leg = new Sculpt(), accessory = new Sculpt();
  // 上身以髋部为旋转点；头和手臂分别保留刚性关节。
  if (look.outfit === "dress") {
    body.flare(look.coat, [[0, -0.29], [0.20, -0.29], [0.23, -0.26], [0.23, -0.21], [0.19, -0.02], [0.16, 0.17], [0.18, 0.36], [0.17, 0.43], [0.12, 0.51], [0, 0.52]]);
    body.oval(look.accent, [0, 0.17, 0], [0.166, 0.025, 0.122]);
    body.box(palette.apricot, [0, 0.17, 0.126], [0.039, 0.034, 0.015], 0.006);
  } else {
    body.column(look.coat, [[-0.015, female ? 0.17 : 0.185, 0.115], [0.04, female ? 0.177 : 0.195, 0.13], [0.22, female ? 0.154 : 0.182, 0.125], [0.43, female ? 0.18 : 0.207, 0.135], [0.51, female ? 0.195 : 0.22, 0.125], [0.56, 0.12, 0.085]]);
    if (look.skirt) body.flare(look.trousers, [[0, -0.25], [0.205, -0.25], [0.232, -0.23], [0.23, -0.19], [0.16, 0.11], [0, 0.11]]);
    else body.box(look.trousers, [0, -0.025, 0], [female ? 0.285 : 0.31, 0.13, 0.22]);
  }
  body.oval(look.skin, [0, 0.565, 0], [0.078, 0.095, 0.075]);
  body.oval(look.accent, [0, 0.515, 0.012], [0.135, 0.075, 0.115]);
  if (look.outfit === "hoodie") {
    body.oval(look.accent, [0, 0.475, -0.09], [0.17, 0.125, 0.10]);
    body.box(look.accent, [0, 0.20, 0.137], [0.23, 0.10, 0.035], 0.022);
    for (const side of [-1, 1]) body.line(ivory, [[side * 0.05, 0.49, 0.11], [side * 0.047, 0.40, 0.15], [side * 0.053, 0.36, 0.154]], 0.008);
  } else if (look.outfit !== "dress") {
    body.box(ivory, [0, 0.38, 0.13], [0.075, 0.25, 0.035], 0.015);
    for (const side of [-1, 1]) {
      body.box(look.accent, [side * 0.072, 0.46, 0.133], [0.07, 0.15, 0.035], 0.015, [0, 0, side * -0.4]);
      body.box(look.accent, [side * 0.115, 0.14, 0.123], [0.09, 0.07, 0.035], 0.015);
    }
    for (const y of [0.34, 0.23, 0.12]) body.oval(palette.chestnut, [0, y, 0.153], [0.012, 0.012, 0.008]);
  }
  if (look.outfit === "blazer" || look.outfit === "coat") {
    if (look.outfit === "coat") {
      body.column(look.coat, [[-0.20, 0.195, 0.13], [-0.16, 0.205, 0.14], [0.18, 0.177, 0.13], [0.23, 0.17, 0.125]]);
      body.oval(look.accent, [0, 0.17, 0], [0.198, 0.025, 0.15]);
    }
    for (const side of [-1, 1]) body.box(look.accent, [side * 0.075, 0.385, 0.143], [0.075, 0.23, 0.034], 0.015, [0, 0, side * -0.37]);
    if (!female) body.box(look.trousers, [0, 0.393, 0.169], [0.031, 0.17, 0.015], 0.008);
  }
  if (look.outfit === "vest") {
    body.box(ivory, [0, 0.44, 0.143], [0.12, 0.17, 0.026], 0.012);
    for (const side of [-1, 1]) body.line(look.accent, [[side * 0.11, 0.51, 0.11], [side * 0.05, 0.39, 0.157], [0, 0.34, 0.166]], 0.013);
  }
  if (look.outfit === "shirt") {
    body.box(look.accent, [-0.10, 0.34, 0.143], [0.074, 0.084, 0.022], 0.012);
    body.line(ivory, [[-0.13, 0.37, 0.156], [-0.10, 0.37, 0.158], [-0.07, 0.37, 0.156]], 0.005);
  }
  if (kind === "hurried") {
    body.line(look.trousers, [[-0.14, 0.48, 0.08], [-0.02, 0.30, 0.15], [0.13, 0.08, 0.13]], 0.026);
    body.box(look.accent, [0.10, 0.08, 0.12], [0.18, 0.17, 0.10], 0.035);
  }
  if (kind === "elderly") {
    body.oval(look.accent, [0, 0.54, 0.045], [0.14, 0.055, 0.11]);
    body.box(look.accent, [0.08, 0.40, 0.14], [0.075, 0.24, 0.028], 0.015, [0, 0, 0.12]);
  }
  const shortSleeves = look.outfit === "shirt" || look.outfit === "dress";
  const sleeve = look.outfit === "vest" ? ivory : look.coat;
  const armWidth = female ? 0.050 : 0.058;
  arm.column(sleeve, [[shortSleeves ? -0.18 : -0.23, armWidth * 0.86, 0.055], [-0.09, armWidth, 0.062], [-0.025, armWidth * 1.04, 0.058], [0.018, armWidth * 0.68, 0.04]]);
  arm.column(shortSleeves ? look.skin : sleeve, [[-0.33, armWidth * 0.75, 0.044], [-0.25, armWidth * 0.84, 0.048], [-0.18, armWidth * 0.86, 0.052]], [0, 0, 0.012]);
  arm.box(shortSleeves ? look.skin : look.accent, [0, -0.319, 0.012], [0.09, 0.035, 0.098], 0.006);
  arm.box(look.skin, [0, -0.365, 0.018], [0.084, 0.095, 0.078], 0.012);
  arm.box(look.skin, [-0.037, -0.35, 0.048], [0.026, 0.055, 0.032], 0.008, [0, 0, -0.2]);
  const legWidth = female ? 0.060 : 0.071;
  leg.column(look.skirt ? look.skin : look.trousers, [[-0.50, legWidth * 0.82, 0.064], [-0.29, legWidth * 0.88, 0.070], [-0.24, legWidth * 0.96, 0.074], [0.02, legWidth, 0.077]]);
  leg.box(look.skirt ? ivory : look.accent, [0, -0.493, 0], [female ? 0.107 : 0.123, 0.04, 0.13], 0.006);
  leg.box(sole, [0, -0.6125, 0.035], [0.145, 0.055, 0.24], 0.009);
  leg.box(kind === "hurried" ? ivory : look.hair, [0, -0.565, 0.035], [0.14, 0.10, 0.235], 0.015);
  leg.box(look.accent, [0, -0.518, 0.065], [0.086, 0.014, 0.065], 0.006);
  if (kind === "luggage") {
    accessory.box(look.accent, [0.32, 0.275, -0.055], [0.24, 0.37, 0.21], 0.045);
    accessory.box(look.coat, [0.32, 0.275, 0.057], [0.16, 0.24, 0.016], 0.012);
    for (const x of [0.258, 0.382]) {
      accessory.line(ivory, [[x, 0.39, 0.069], [x, 0.28, 0.069], [x, 0.17, 0.069]], 0.007);
      accessory.line(ink, [[x, 0.46, -0.055], [x, 0.66, -0.055], [x, 0.85, -0.055]], 0.008);
      accessory.oval(ink, [x, 0.063, -0.055], [0.033, 0.033, 0.03]);
    }
    accessory.box(ink, [0.32, 0.845, -0.055], [0.16, 0.032, 0.03], 0.012);
    accessory.box(palette.lemon, [0.393, 0.405, 0.06], [0.04, 0.07, 0.014], 0.006, [0, 0, -0.2]);
  }
  if (kind === "elderly") {
    accessory.line(palette.chestnut, [[0.22, 0.05, 0.13], [0.22, 0.45, 0.13], [0.22, 0.83, 0.13], [0.18, 0.86, 0.13], [0.16, 0.83, 0.13]], 0.016);
    accessory.oval(ink, [0.22, 0.03, 0.13], [0.025, 0.03, 0.025]);
  }
  const arms = arm.finish(), legs = leg.finish();
  const headWidth = kind === "elderly" ? 0.94 : 1;
  return { body: body.finish().scale(look.width, 1, 1), head: head.finish().scale(headWidth * 0.78, 0.78, headWidth * 0.82), leftArm: arms, rightArm: arms, leftLeg: legs, rightLeg: legs, accessory: accessory.finish() };
}

/** 最多 128 套按需缓存（四类 × 八种男女造型 × 四配色），关节独立。 */
export function createPassengerModel(kind: CrowdKind, id: string) {
  const look = passengerAppearance(kind, id);
  const key = `${kind}:${look.variant}`;
  let geometry = templates.get(key);
  if (!geometry) { geometry = sculptPassenger(kind, id); templates.set(key, geometry); }
  const root = new Group(), upper = new Group();
  root.name = `passenger-${kind}-${look.gender}-${look.hairStyle}`;
  root.userData = { gender: look.gender, style: look.style, colorway: look.colorway };
  root.scale.y = look.height;
  upper.position.y = 0.69; root.add(upper);
  const add = (part: Part, parent: Group, position: Vec3) => {
    const joint = new Group(); joint.name = part; joint.position.set(...position);
    if (geometry[part].getAttribute("position")) {
      const mesh = new Mesh(geometry[part], cloth); mesh.name = `${part}-surface`;
      mesh.castShadow = mesh.receiveShadow = true; joint.add(mesh);
    }
    parent.add(joint); return joint;
  };
  add("body", upper, [0, 0, 0]);
  const head = add("head", upper, [0, 0.77, 0]);
  const shoulder = look.gender === "female" ? 0.198 : 0.215;
  const hip = look.gender === "female" ? 0.09 : 0.10;
  const arms = [add("leftArm", upper, [-shoulder, 0.50, 0]), add("rightArm", upper, [shoulder, 0.50, 0])];
  const legs = [add("leftLeg", root, [-hip, 0.64, 0]), add("rightLeg", root, [hip, 0.64, 0])];
  add("accessory", root, [0, 0, 0]);
  return { root, upper, head, arms, legs, look };
}

/** 只读取展示时钟，暂停/回放可复现；减少动态效果时仍保留办理姿态。 */
export function posePassenger(model: ReturnType<typeof createPassengerModel>, kind: CrowdKind, motion: Motion, time: number, reducedMotion: boolean) {
  const phase = time * (kind === "hurried" ? 12 : 9);
  const walking = motion === "walk" && !reducedMotion;
  const stride = walking ? Math.sin(phase) * (kind === "elderly" ? 0.14 : 0.16) : 0;
  model.root.position.y = walking ? (1 - Math.cos(phase * 2)) * 0.009 : 0;
  model.upper.rotation.x = kind === "elderly" ? 0.045 : motion === "jump" ? -0.2 : 0;
  model.upper.rotation.z = walking ? Math.sin(phase) * 0.018 : 0;
  model.head.rotation.y = walking ? Math.sin(phase) * 0.035 : 0;
  for (let i = 0; i < 2; i++) {
    const sign = i ? -1 : 1;
    model.legs[i].rotation.x = stride * sign;
    model.arms[i].rotation.x = motion === "interact" ? -0.6 : -stride * sign * 0.7;
    model.arms[i].rotation.z = 0;
  }
  if (motion !== "interact" && (kind === "luggage" || kind === "elderly")) {
    model.arms[1].rotation.x = kind === "luggage" ? 0.20 : -0.31;
    model.arms[1].rotation.z = kind === "luggage" ? model.look.gender === "female" ? 0.28 : 0.23 : 0;
  }
}
