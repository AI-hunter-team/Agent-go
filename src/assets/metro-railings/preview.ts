import {
  ACESFilmicToneMapping, BoxGeometry, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry,
  Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PMREMGenerator, RepeatWrapping, Scene, Shape, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeRailingGeometry, fitMetroRailingSpan, METRO_RAILING_ASSETS } from "./index";

type Mode = "compare" | "metal" | "glass" | "corner" | "stairs";
const stage = document.querySelector<HTMLElement>(".stage")!;
const status = document.querySelector<HTMLElement>("#status")!;
const slider = document.querySelector<HTMLInputElement>("#span")!;
const renderer = new WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap; stage.prepend(renderer.domElement);
const scene = new Scene(); scene.background = new Color("#e8ece0");
const pmrem = new PMREMGenerator(renderer), room = new RoomEnvironment();
const darkCard = new Mesh(new BoxGeometry(5, 7, 0.3), new MeshBasicMaterial({ color: "#26352d" })); darkCard.position.set(2, 2.5, 4.5); room.add(darkCard);
const environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.75;
room.dispose(); pmrem.dispose();
scene.add(new HemisphereLight("#ffffff", "#7d8b73", 0.8));
const light = new DirectionalLight("#fff8e8", 2); light.position.set(-2, 7, 4); light.castShadow = true;
light.shadow.mapSize.set(2048, 2048); light.shadow.camera.left = -12; light.shadow.camera.right = 12;
light.shadow.camera.top = 12; light.shadow.camera.bottom = -12; light.shadow.bias = -0.0001; light.shadow.normalBias = 0.015;
scene.add(light);
const fill = new DirectionalLight("#e6f1ff", 0.5); fill.position.set(5, 3, -6); scene.add(fill);
const camera = new PerspectiveCamera(40, 1, 0.03, 120);
const controls = new OrbitControls(camera, renderer.domElement); controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 0.5; controls.maxDistance = 30; controls.enableDamping = false;

const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#b8c0ab"; ctx.fillRect(0, 0, 512, 512);
let seed = 32631;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
for (let i = 0; i < 26000; i++) { ctx.fillStyle = ["#cdd0bd", "#9ca993", "#e6e5d7", "#aeb79f"][Math.floor(random() * 4)]; ctx.fillRect(random() * 512, random() * 512, 0.5 + random() * 1.4, 0.5 + random() * 1.4); }
const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.wrapS = map.wrapT = RepeatWrapping; map.repeat.set(6, 6); map.anisotropy = 4;
const floorMaterial = new MeshStandardMaterial({ map, roughness: 0.83, metalness: 0.03 });
const floor = new Mesh(new BoxGeometry(35, 0.08, 35), floorMaterial); floor.position.y = -0.042; floor.receiveShadow = true; scene.add(floor);
const models = new Map<string, Group>(); const active = new Group(); scene.add(active);
let mode: Mode = "compare", length = 3, loaded = false, renderPending = false, fitted = false;
function render() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderer.render(scene, camera); });
}
controls.addEventListener("change", render);
new ResizeObserver(() => { camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(stage.clientWidth, stage.clientHeight); render(); }).observe(stage);

function sample(id: string, x: number, z = 0) {
  const source = models.get(id)!;
  const canFit = id.endsWith("straight") && length !== 3;
  const root = canFit ? fitMetroRailingSpan(source, length) : source.clone(true);
  fitted ||= canFit; root.position.set(x, 0, z); active.add(root); return root;
}
function resetCamera() {
  const compare = mode === "compare", stairs = mode === "stairs";
  const span = mode === "corner" ? 3.3 : length;
  const target = stairs ? new Vector3(0, -0.45, -0.9) : new Vector3(0, 0.42, 0);
  controls.target.copy(target);
  camera.position.copy(target).add(stairs ? new Vector3(7, 4, 11) : compare ? new Vector3(span * 0.9, 2.3 + span * 0.3, span * 2.2 + 1.8) : new Vector3(span * 0.8, 1.1 + span * 0.22, span * 1.45 + 1.2));
  camera.lookAt(target); controls.update(); render();
}
function ramp() {
  const shape = new Shape(); shape.moveTo(-4.5, 0); shape.lineTo(4.5, -2); shape.lineTo(4.5, -2.18); shape.lineTo(-4.5, -0.18); shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 2.5, bevelEnabled: false }); geometry.translate(0, 0, -2.5); geometry.userData.metroTransient = true;
  const slab = new Mesh(geometry, floorMaterial); slab.receiveShadow = true; active.add(slab);
}
function select(nextMode: Mode, nextLength = length) {
  if (!loaded) return;
  mode = nextMode; length = nextLength; fitted = false;
  for (const child of [...active.children]) { disposeRailingGeometry(child); active.remove(child); }
  floor.position.y = mode === "stairs" ? -2.225 : -0.042;
  if (mode === "compare") { sample("metal-straight", -(length / 2 + 0.5)); sample("glass-straight", length / 2 + 0.5); }
  if (mode === "metal" || mode === "glass") sample(mode + "-straight", 0);
  if (mode === "corner") { sample("metal-corner", -1.3); sample("glass-corner", 1.3); }
  if (mode === "stairs") { sample("glass-stairs", 0); sample("glass-stairs", 0, -2.5); ramp(); }
  slider.disabled = mode === "stairs" || mode === "corner"; slider.value = String(length);
  document.querySelector("#span-value")!.textContent = mode === "stairs" ? "9.00 m" : mode === "corner" ? "1.50 × 1.50 m" : length.toFixed(2) + " m";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  const copy = {
    compare: ["圆管与玻璃 · A / B 对照", "银色不锈钢 · 圆角连接 · 透明视线", "同一尺度，两种结构", "高 1.10 m · 固定底座直径 0.16 m<br />左侧 A 圆管；右侧 B 玻璃。"],
    metal: ["A · 圆角不锈钢圆管", "安检导流 / 闸机旁固定隔断", "圆管外框 · 两道横杆", "外框管径 50 mm · 横杆 32 mm<br />圆角回弯，紧凑固定法兰与螺栓。"],
    glass: ["B · 连续扶手与透明玻璃", "楼梯洞口 / 平台周边护栏", "细立柱 · 透明面板 · 圆形夹具", "玻璃厚 12 mm · 扶手管径 50 mm<br />板块分段夹持，保留视线通透。"],
    corner: ["90° · 转角与连续连接", "共用角柱 · 杆件保持原有粗细", "1.50 × 1.50 m 转角模块", "左侧 A；右侧 B。<br />两侧连接点位于外端柱心。"],
    stairs: ["B · 楼梯斜段装配", "扶手顺坡 / 立柱竖直 / 玻璃分段夹持", "9 m 水平包络 · 下降 2 m", "脚点对应各段标高，杆径保持不变。<br />坡面仅作装配参照，正式台阶由另一任务制作。"],
  }[mode];
  ["#view-title", "#view-subtitle", "#spec-title"].forEach((selector, i) => { document.querySelector(selector)!.textContent = copy[i]; });
  document.querySelector("#spec")!.innerHTML = copy[3];
  status.textContent = fitted ? "已按长度重新拼装" : "已载入栏杆小样";
  resetCamera();
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) button.addEventListener("click", () => select(button.dataset.mode as Mode));
slider.addEventListener("input", () => select(mode, Number(slider.value)));
document.querySelector("#reset")!.addEventListener("click", resetCamera);

const loader = new GLTFLoader(), base = import.meta.env.DEV ? "/assets/metro-railings/" : "./assets/metro-railings/";
try {
  const attempts = await Promise.allSettled(METRO_RAILING_ASSETS.map(async ({ id }) => {
    const { scene: model } = await loader.loadAsync(base + "models/" + id + ".glb");
    model.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) if (material.transparent) material.depthWrite = false;
      node.castShadow = !node.userData.noShadow; node.receiveShadow = !node.userData.noShadow;
    });
    return { id, model };
  }));
  for (const result of attempts) if (result.status === "fulfilled") models.set(result.value.id, result.value.model);
  const failure = attempts.find((result) => result.status === "rejected"); if (failure?.status === "rejected") throw failure.reason;
  loaded = true; select("compare");
} catch (error) {
  status.textContent = "小样载入失败，请确认已生成栏杆模型并刷新。"; status.classList.add("error"); console.error(error);
}

const debug = window as typeof window & { metroRailingsSetView?: typeof select; metroRailingsInspect?: () => object };
debug.metroRailingsSetView = select;
debug.metroRailingsInspect = () => {
  let posts = 0, panels = 0;
  active.traverse((node) => { if (node.userData.component === "post") posts++; if (node.userData.component === "glass_panel") panels++; });
  return { loaded, mode, length, fitted, files: models.size, posts, panels, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
};
