import {
  ACESFilmicToneMapping, AmbientLight, Box3, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Fog, HalfFloatType,
  GridHelper, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, RectAreaLight, Scene, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { makeMaterials, setFacilityState, setGateProgress, type FacilityState } from "./index";
import { fitMetroRailingSpan, disposeRailingGeometry } from "../metro-railings/index";
import { BASE_WALL_HEIGHT, STATION_CEILING } from "./dimensions";
import { createSignTexture, SIGN_FACE } from "./signs";
import { createFloorReflection, disposeFloorReflection } from "./reflection";

interface Entry {
  id: string; label: string; category: string; state: FacilityState; description: string;
  file: string; bytes: number; triangles: number; bounds: { min: number[]; max: number[]; size: number[] };
}
interface Manifest { assets: Entry[]; materials: { file: string }[]; }
type View = "scene" | "asset" | "materials";
// 获取预览页面中已约定存在的控件。
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = new URL("/assets/station-kit/", location.origin).href;
const prototypes = new Map<string, Group>(), materialPool = new Map<string, MeshStandardMaterial>();
const validation = { loaded: 0, expected: 0, errors: [] as string[], boundsChecked: 0, renderer: "", ready: false };
Object.assign(window, { stationKitValidation: validation });
let manifest: Manifest, mode: View = "scene", selected = "ticket-machine", layout = "split", cameraView = "interior", state: FacilityState = "open", opening = 0;
const stage = element("viewport"), scene = new Scene();
scene.background = new Color("#e9e1cf");
scene.fog = new Fog("#e9e1cf", 22, 62);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
stage.append(renderer.domElement);
const context = renderer.getContext(), extension = context.getExtension("WEBGL_debug_renderer_info");
validation.renderer = String(extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER));
const camera = new PerspectiveCamera(62, 1, 0.05, 150), controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2 + 0.12; controls.minDistance = 1; controls.maxDistance = 65;
scene.add(new HemisphereLight("#fff2d9", "#a1a28f", 0.85), new AmbientLight("#f4e6ce", 0.2));
const pmrem = new PMREMGenerator(renderer), roomEnvironment = new RoomEnvironment();
scene.environment = pmrem.fromScene(roomEnvironment, 0.04).texture; scene.environmentIntensity = 0.4;
roomEnvironment.dispose(); pmrem.dispose(); RectAreaLightUniformsLib.init();
const sun = new DirectionalLight("#ffe6b8", 2.4);
// Keep the sun below the roof line at the west windows so light reaches the room.
sun.position.set(-18, STATION_CEILING - 0.8, 9); sun.target.position.set(2, 0, -5); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.normalBias = 0.025; sun.shadow.bias = -0.0001; sun.shadow.radius = 3; scene.add(sun);
const content = new Group(); scene.add(content);
const grid = new GridHelper(36, 12, "#969c8b", "#c6ccbb"); grid.position.y = 0.015; grid.visible = false; scene.add(grid);
const ground = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: "#dde0d4", roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.14; ground.receiveShadow = true; scene.add(ground);
const stateMaterials = makeMaterials();
const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const ssao = new SSAOPass(scene, camera, 1, 1, 16);
ssao.kernelRadius = 0.45; ssao.minDistance = 0.0015; ssao.maxDistance = 0.015;
composer.addPass(ssao); composer.addPass(new OutputPass());
// 提供只读场景快照，供素材浏览器检查核对实际加载的实例。
Object.assign(window, { stationKitInspect: () => {
  const hinges: number[] = [], indicators: string[] = []; let meshes = 0, ceilingPanels = 0, reflections = 0;
  content.traverse((node) => {
    if (node instanceof Mesh) meshes++;
    if (node.userData.assetId === "ceiling-panel") ceilingPanels++;
    if (node instanceof Reflector) reflections++;
    if (node.userData.role === "gateHinge") hinges.push(node.rotation.y);
    if (node instanceof Mesh && node.userData.role === "statusIndicator") indicators.push((node.material as MeshStandardMaterial).name);
  });
  const guides = content.children.filter((node) => String(node.userData.previewAssetId).startsWith("route-") || node.userData.previewAssetId === "marking-arrow")
    .map((node) => ({ id: node.userData.previewAssetId as string, x: node.position.x, z: node.position.z, rotation: node.rotation.y }));
  const securityOpenings = content.children.filter((node) => node.userData.previewAssetId === "security-arch").map((node) => node.position.x);
  return { mode, selected, layout, cameraView, state, opening, ceiling: STATION_CEILING, meshes, hinges, indicators, ceilingPanels, reflections, contactShadows: ssao.enabled, gpuGeometries: renderer.info.memory.geometries, cameraPosition: camera.position.toArray(), guides, securityOpenings };
} });
// 克隆已加载的素材，并应用位置、朝向及当前设施状态。
function add(id: string, x = 0, z = 0, rotation = 0, y = 0) {
  const proto = prototypes.get(id); if (!proto) throw new Error("Missing model: " + id);
  const clone = proto.clone(true); clone.userData.previewAssetId = id; clone.position.set(x, y, z); clone.rotation.y = rotation; content.add(clone);
  setFacilityState(clone, state, stateMaterials); setGateProgress(clone, opening); return clone;
}
// 将动态文字绘制到悬挂标牌上。
function sign(text: string, x: number, z: number, y = 2.9, width = 2.8, rotation = 0) {
  const item = add("sign-panel", x, z, rotation, y); item.scale.x = width / 2.8;
  const texture = createSignTexture(text, width);
  const panel = new Mesh(new PlaneGeometry(SIGN_FACE.width, SIGN_FACE.height), new MeshBasicMaterial({ map: texture, toneMapped: false }));
  panel.position.set(0, 0.25, 0.067); panel.userData.previewOnly = true; item.add(panel);
}
// 移除当前展示，并释放预览临时创建的几何、纹理和反射资源。
function clearContent() {
  disposeRailingGeometry(content);
  content.traverse((node) => {
    if (node instanceof Reflector) { disposeFloorReflection(node); return; }
    if (node instanceof Mesh && node.userData.previewGeometry) node.geometry.dispose();
    if (node instanceof Mesh && node.userData.previewOnly) {
      node.geometry.dispose();
      const mat = node.material as MeshBasicMaterial; mat.map?.dispose(); mat.dispose();
    }
  });
  content.clear();
}
// 创建室内地面的柔化反射层。
function floorReflection() {
  content.add(createFloorReflection(18, 24, 0, -3));
}
// 在柱体正面添加动态检票方向标识。
function columnSign(pillar: Group) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 1024;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#303630"; ctx.fillRect(0, 0, 512, 1024);
  ctx.fillStyle = "#f6efdc"; ctx.textAlign = "center"; ctx.font = '300 300px "Segoe UI", sans-serif'; ctx.fillText("↑", 256, 390);
  ctx.font = '500 100px "Microsoft YaHei", sans-serif'; ctx.fillText("检票口", 256, 730);
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  const panel = new Mesh(new PlaneGeometry(0.65, 1.5), new MeshBasicMaterial({ map, toneMapped: false }));
  panel.position.set(0, 2.0, 1.024); panel.userData.previewOnly = true; pillar.add(panel);
}
// 根据本布局的安检开口拼接直段、转角、分流与方向箭头。
function buildGuideRoutes(openings: number[]) {
  const leftX = openings[0], rightX = openings[openings.length - 1];
  if (layout === "straight") {
    for (const z of [7.5, 4.5, 1.5, -1.5, -4.5, -7.5]) add("route-straight", leftX, z);
    for (const z of [6, -0.2, -8.2]) add("marking-arrow", leftX, z);
    return;
  }
  const entryX = leftX + 3, forkZ = layout === "dogleg" ? 4.5 : 1.5;
  for (let z = 7.5; z > forkZ; z -= 3) add("route-straight", entryX, z);
  add("route-split", entryX, forkZ);
  add("route-turn", leftX, forkZ, Math.PI / 2);
  add("route-turn", rightX, forkZ, Math.PI);
  // 较宽的绕柱布局需要在分流与右侧弯道之间补上横向直段。
  for (let x = entryX + 3; x < rightX; x += 3) add("route-straight", x, forkZ, Math.PI / 2);
  for (let z = forkZ - 3; z >= -7.5; z -= 3) add("route-straight", leftX, z);
  let exitX = rightX;
  if (layout === "dogleg") {
    for (const z of [1.5, -1.5]) add("route-straight", rightX, z);
    // 穿过右侧开口后向内回折，避开下游柱体并朝向闸机。
    exitX = rightX - 3;
    add("route-turn", rightX, -4.5, Math.PI * 1.5);
    add("route-turn", exitX, -4.5, Math.PI / 2);
    add("route-straight", exitX, -7.5);
    add("marking-arrow", rightX, -0.2);
  } else {
    for (const z of [-1.5, -4.5, -7.5]) add("route-straight", rightX, z);
  }
  add("marking-arrow", entryX, 6);
  add("marking-arrow", leftX, -0.2);
  add("marking-arrow", exitX, -8.2);
}
// 使用当前布局组装站厅建筑、设备、导向和室内照明。
function buildRoom() {
  const overview = cameraView === "overview";
  for (let x = -7.5; x <= 7.5; x += 3) for (let z = -13.5; z <= 7.5; z += 3) {
    add("floor-sage", x, z);
    if (!overview) add("ceiling-panel", x, z, 0, STATION_CEILING);
  }
  for (let x = -7.5; x <= 7.5; x += 3) { add("wall-straight", x, -15); add("ceiling-fascia", x, -15, 0, BASE_WALL_HEIGHT); }
  for (let z = -13.5; z <= 7.5; z += 3) {
    add("window-bay", -9, z, Math.PI / 2);
    add(z < -6 ? "window-bay" : "wall-straight", 9, z, -Math.PI / 2);
    add("ceiling-fascia", -9, z, Math.PI / 2, BASE_WALL_HEIGHT); add("ceiling-fascia", 9, z, -Math.PI / 2, BASE_WALL_HEIGHT);
  }
  for (const z of [2.0, 0.8, -0.4]) add("ticket-machine", -8.1, z, Math.PI / 2);
  const openings = layout === "straight" ? [-1.5, 1.5] : layout === "dogleg" ? [-4.5, 4.5] : [-4.5, -1.5, 1.5];
  for (let x = -7.5; x <= 7.5; x += 3) {
    const open = openings.includes(x);
    if (open) { add("security-arch", x, -1.4); add("marking-queue", x, -0.6); }
  }
  const railing = (start: number, end: number, z: number) => {
    if (end - start < 0.32) { if (end > start) add("metal-end", (start + end) / 2, z); return; }
    const span = fitMetroRailingSpan(prototypes.get("metal-straight")!, end - start);
    span.position.set((start + end) / 2, 0, z); content.add(span);
  };
  let end = -9;
  for (const x of openings) { railing(end, x - 1.22, -1.5); end = x + 1.22; }
  railing(end, 9, -1.5);
  const pillars = layout === "dogleg" ? [[2, 0.5], [-2, -5], [4, -8]] : [[2, 0.5], [-3, -6.5], [3, -7.5]];
  for (const [x, z] of pillars) { const pillar = add("pillar", x, z); if (z > 0) columnSign(pillar); }
  if (layout === "dogleg") add("partition", 0, -5);
  for (let i = 0; i < 5; i++) add("fare-gate", 1.2 + i * 1.4, -10.5);
  end = -9;
  for (let i = 0; i < 5; i++) { const x = 1.2 + i * 1.4; railing(end, x - 0.61, -10.5); end = x + 0.61; }
  railing(end, 9, -10.5);
  add("metal-corner", 6, 4.5); add("metal-end", 7.5, 4.5);
  add("glass-straight", 5.5, 6.4); add("glass-corner", 5.5, -13.2);
  buildGuideRoutes(openings);
  sign("自助购票", -8.0, 0.8, 2.65, 3.9, Math.PI / 2);
  sign("↑  安全检查", -1.5, -1.24, 2.7, layout === "split" ? 8.8 : 5.8);
  sign("↑  检票口", 4, -10.3, 2.65, 5.5);
  for (const z of [6, 0, -6, -12]) for (const x of [-6, 0, 6]) add("structural-frame", x, z);
  if (!overview) {
    for (const z of [3, -3, -9]) for (const x of [-6, 0, 6]) add("light-strip", x, z, 0, STATION_CEILING - 0.015);
    for (const z of [5, -3, -10]) {
      const light = new RectAreaLight("#ffe4b8", 3.8, 10, 2.4); light.position.set(0, STATION_CEILING - 0.15, z); light.lookAt(0, 0, z); content.add(light);
    }
    floorReflection();
  }
}
// 将共享材质展示为同一光照下的球体样本。
function buildMaterialDisplay() {
  const names = ["kit.terrazzo.ivory", "kit.terrazzo.sage", "kit.plaster.ivory", "kit.coating.ochre", "kit.coating.charcoal", "kit.paint.brick"];
  names.forEach((name, i) => {
    const mat = materialPool.get(name); if (!mat) return;
    const x = (i % 3 - 1) * 3.3, z = Math.floor(i / 3) * 3.3 - 1.65;
    const sphere = new Mesh(new SphereGeometry(0.92, 48, 32), mat); sphere.position.set(x, 1.13, z); sphere.castShadow = true; sphere.userData.previewGeometry = true; content.add(sphere);
    const base = new Mesh(new CylinderGeometry(1.16, 1.16, 0.2, 48), stateMaterials.pale); base.position.set(x, 0.1, z); base.receiveShadow = true; base.userData.previewGeometry = true; content.add(base);
  });
}
// 根据当前展示模式恢复相机与观察目标。
function resetCamera() {
  if (mode === "scene" && cameraView === "interior") { camera.position.set(-5.9, 1.62, 8.4); controls.target.set(-2.4, 1.7, -9); camera.fov = 68; }
  else if (mode === "scene") { camera.position.set(19, 17, 27); controls.target.set(0, 0.8, -3); camera.fov = 45; }
  else if (mode === "materials") { camera.position.set(9, 9, 12); controls.target.set(0, 0.7, 0); }
  else {
    const box = new Box3().setFromObject(content), size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1.2);
    controls.target.copy(centre); camera.position.copy(centre).add(new Vector3(1.55, 1.2, 2.25).multiplyScalar(radius));
  }
  if (mode !== "scene") camera.fov = 42;
  camera.updateProjectionMatrix();
  ssao.setSize(Math.max(1, stage.clientWidth * renderer.getPixelRatio()), Math.max(1, stage.clientHeight * renderer.getPixelRatio()));
  controls.update();
}
// 重建所选视图，并同步素材信息、下载链接和控件状态。
function refresh() {
  if (!manifest) return;
  clearContent();
  if (mode === "scene") buildRoom(); else if (mode === "materials") buildMaterialDisplay(); else add(selected);
  const entry = manifest.assets.find((a) => a.id === selected && (a.state === state || a.category !== "facility"))!;
  const size = entry.bounds.size.map((n) => n.toFixed(2)).join(" × ");
  element("asset-info").innerHTML = "<strong>" + entry.label + "</strong><p>" + entry.description + "</p><dl><dt>尺寸 / m</dt><dd>" + size + "</dd><dt>三角面</dt><dd>" + entry.triangles.toLocaleString() + "</dd><dt>GLB</dt><dd>" + Math.round(entry.bytes / 1024) + " KB</dd></dl>";
  const download = element<HTMLAnchorElement>("download"); download.href = new URL(entry.file, base).href; download.download = entry.file.split("/").pop()!;
  element("view-title").textContent = mode === "scene" ? "可拼装样板站厅" : mode === "asset" ? entry.label : "同一光照下的六种表面";
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.querySelectorAll<HTMLButtonElement>("[data-asset]").forEach((b) => b.classList.toggle("active", b.dataset.asset === selected));
  (document.querySelector(".layout-switch") as HTMLElement).hidden = mode !== "scene";
  (document.querySelector(".camera-switch") as HTMLElement).hidden = mode !== "scene";
  ssao.enabled = mode === "scene" && element<HTMLInputElement>("surface-detail").checked;
  resetCamera();
}
new ResizeObserver(() => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); composer.setSize(w, h); }).observe(stage);
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.mode as View; refresh(); }));
document.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach((button) => button.addEventListener("click", () => {
  layout = button.dataset.layout!; document.querySelectorAll("[data-layout]").forEach((b) => b.classList.toggle("active", b === button)); refresh();
}));
document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => button.addEventListener("click", () => {
  cameraView = button.dataset.camera!; document.querySelectorAll("[data-camera]").forEach((b) => b.classList.toggle("active", b === button)); refresh();
}));
element<HTMLSelectElement>("state").addEventListener("change", (event) => { state = (event.target as HTMLSelectElement).value as FacilityState; refresh(); });
element<HTMLInputElement>("gate").addEventListener("input", (event) => { opening = Number((event.target as HTMLInputElement).value) / 100; element("gate-value").textContent = Math.round(opening * 100) + "%"; setGateProgress(content, opening); });
element<HTMLInputElement>("grid").addEventListener("change", (event) => { grid.visible = (event.target as HTMLInputElement).checked; });
element<HTMLInputElement>("surface-detail").addEventListener("change", (event) => { ssao.enabled = mode === "scene" && (event.target as HTMLInputElement).checked; });
element("reset").addEventListener("click", resetCamera);
renderer.setAnimationLoop(() => { controls.update(); composer.render(); });

// 加载清单和全部 GLB，核对尺寸后启用素材预览。
async function init() {
  const response = await fetch(base + "manifest.json"); if (!response.ok) throw new Error("Asset manifest HTTP " + response.status);
  manifest = await response.json() as Manifest; validation.expected = manifest.assets.length;
  const metroBase = new URL("/assets/metro-railings/", location.origin);
  const metroResponse = await fetch(new URL("manifest.json", metroBase));
  if (!metroResponse.ok) throw new Error("Railing manifest HTTP " + metroResponse.status);
  const metro = await metroResponse.json() as { assets: Entry[] };
  manifest.assets.push(...metro.assets.map((entry) => ({ ...entry, state: "open" as const, category: "barrier", description: "中国地铁圆管 / 玻璃护栏；高1.1m，紧凑固定底座。", file: new URL(entry.file, metroBase).href })));
  validation.expected = manifest.assets.length;
  const loader = new GLTFLoader();
  await Promise.all(manifest.assets.map(async (entry) => {
    try {
      const gltf = await loader.loadAsync(new URL(entry.file, base).href);
      const box = new Box3().setFromObject(gltf.scene), actual = box.getSize(new Vector3()).toArray();
      if (actual.some((value, i) => Math.abs(value - entry.bounds.size[i]) > 0.002)) throw new Error("Round-trip bounds mismatch");
      validation.boundsChecked++;
      gltf.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        node.castShadow = !node.userData.noShadow; node.receiveShadow = true;
        const mat = node.material as MeshStandardMaterial;
        if (mat.transparent) mat.depthWrite = false;
        if (materialPool.has(mat.name)) node.material = materialPool.get(mat.name)!; else materialPool.set(mat.name, mat);
      });
      if (entry.state === "open") prototypes.set(entry.id, gltf.scene);
      validation.loaded++;
    } catch (error) { validation.errors.push(entry.file + ": " + String(error)); }
  }));
  if (validation.errors.length) throw new Error(validation.errors.join("; "));
  const unique = manifest.assets.filter((a) => a.state === "open" && !a.id.startsWith("railing-"));
  element("asset-count").textContent = unique.length + " 类";
  element("asset-list").innerHTML = unique.map((a) => "<button data-asset=\"" + a.id + "\">" + a.label + "<small>" + (a.category === "facility" ? "FACILITY" : a.category === "architecture" ? "STRUCTURE" : "WAYFINDING") + "</small></button>").join("");
  element("asset-list").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => { selected = b.dataset.asset!; mode = "asset"; refresh(); }));
  element<HTMLAnchorElement>("manifest-link").href = base + "manifest.json";
  element("load-status").textContent = validation.loaded + "/" + validation.expected + " GLB 已载入 · 尺寸复核通过";
  refresh(); validation.ready = true;
}
init().catch((error) => { validation.errors.push(String(error)); element("error").hidden = false; element("error").textContent = "预览加载失败：" + String(error); element("load-status").textContent = "加载失败"; console.error(error); });
