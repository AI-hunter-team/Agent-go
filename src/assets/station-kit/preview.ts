import {
  ACESFilmicToneMapping, AmbientLight, Box3, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Fog, HalfFloatType,
  GridHelper, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, RectAreaLight, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget,
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

interface Entry {
  id: string; label: string; category: string; state: FacilityState; description: string;
  file: string; bytes: number; triangles: number; bounds: { min: number[]; max: number[]; size: number[] };
}
interface Manifest { assets: Entry[]; materials: { file: string }[]; }
type View = "scene" | "asset" | "materials";
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
sun.position.set(-18, 5.2, 9); sun.target.position.set(2, 0, -5); scene.add(sun.target);
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
Object.assign(window, { stationKitInspect: () => {
  const hinges: number[] = [], indicators: string[] = []; let meshes = 0, ceilingPanels = 0, reflections = 0;
  content.traverse((node) => {
    if (node instanceof Mesh) meshes++;
    if (node.userData.assetId === "ceiling-panel") ceilingPanels++;
    if (node instanceof Reflector) reflections++;
    if (node.userData.role === "gateHinge") hinges.push(node.rotation.y);
    if (node instanceof Mesh && node.userData.role === "statusIndicator") indicators.push((node.material as MeshStandardMaterial).name);
  });
  return { mode, selected, layout, cameraView, state, opening, meshes, hinges, indicators, ceilingPanels, reflections, contactShadows: ssao.enabled, gpuGeometries: renderer.info.memory.geometries, cameraPosition: camera.position.toArray() };
} });
function add(id: string, x = 0, z = 0, rotation = 0, y = 0) {
  const proto = prototypes.get(id); if (!proto) throw new Error("Missing model: " + id);
  const clone = proto.clone(true); clone.position.set(x, y, z); clone.rotation.y = rotation; content.add(clone);
  setFacilityState(clone, state, stateMaterials); setGateProgress(clone, opening); return clone;
}
function sign(text: string, x: number, z: number, y = 2.9, width = 2.8, rotation = 0) {
  const item = add("sign-panel", x, z, rotation, y); item.scale.x = width / 2.8;
  const canvas = document.createElement("canvas"); canvas.width = Math.round(1024 * width / 2.8); canvas.height = 160;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#343b39"; ctx.fillRect(0, 0, canvas.width, 160);
  ctx.fillStyle = "#f5f0df"; ctx.font = '500 74px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, canvas.width / 2, 80);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const panel = new Mesh(new PlaneGeometry(2.6, 0.39), new MeshBasicMaterial({ map: texture, toneMapped: false }));
  panel.position.set(0, 0.25, 0.067); panel.userData.previewOnly = true; item.add(panel);
}
function clearContent() {
  content.traverse((node) => {
    if (node instanceof Reflector) { node.dispose(); node.geometry.dispose(); return; }
    if (node instanceof Mesh && node.userData.previewGeometry) node.geometry.dispose();
    if (node instanceof Mesh && node.userData.previewOnly) {
      node.geometry.dispose();
      const mat = node.material as MeshBasicMaterial; mat.map?.dispose(); mat.dispose();
    }
  });
  content.clear();
}
function floorReflection() {
  const shader = {
    name: "SoftTerrazzoReflection",
    uniforms: { tDiffuse: { value: null }, color: { value: new Color("#eee9df") }, textureMatrix: { value: null } },
    vertexShader: "uniform mat4 textureMatrix; varying vec4 vUv; void main(){vUv=textureMatrix*vec4(position,1.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: [
      "uniform sampler2D tDiffuse; uniform vec3 color; varying vec4 vUv;",
      "void main(){vec2 uv=vUv.xy/vUv.w;vec2 d=vec2(0.003,0.004);",
      "vec3 c=texture2D(tDiffuse,uv).rgb*0.4;",
      "c+=texture2D(tDiffuse,uv+d).rgb*0.15;c+=texture2D(tDiffuse,uv-d).rgb*0.15;",
      "c+=texture2D(tDiffuse,uv+vec2(d.x,-d.y)).rgb*0.15;c+=texture2D(tDiffuse,uv+vec2(-d.x,d.y)).rgb*0.15;",
      "gl_FragColor=vec4(c*color,0.26);",
      "#include <tonemapping_fragment>",
      "#include <colorspace_fragment>",
      "}",
    ].join("\n"),
  };
  const mirror = new Reflector(new PlaneGeometry(18, 24), { color: "#eae7dc", textureWidth: 768, textureHeight: 512, clipBias: 0.003, multisample: 0, shader });
  mirror.name = "preview_floor_reflection"; mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, 0.004, -3);
  const mat = mirror.material as ShaderMaterial; mat.transparent = true; mat.depthWrite = false;
  const reflectionRender = mirror.onBeforeRender.bind(mirror);
  mirror.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    if (!scene.overrideMaterial) reflectionRender(renderer, scene, camera, geometry, material, group);
  };
  content.add(mirror);
}
function columnSign(pillar: Group) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 1024;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#303630"; ctx.fillRect(0, 0, 512, 1024);
  ctx.fillStyle = "#f6efdc"; ctx.textAlign = "center"; ctx.font = '300 300px "Segoe UI", sans-serif'; ctx.fillText("↑", 256, 390);
  ctx.font = '500 100px "Microsoft YaHei", sans-serif'; ctx.fillText("检票口", 256, 730);
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  const panel = new Mesh(new PlaneGeometry(0.65, 1.5), new MeshBasicMaterial({ map, toneMapped: false }));
  panel.position.set(0, 2.0, 1.024); panel.userData.previewOnly = true; pillar.add(panel);
}
function buildRoom() {
  const overview = cameraView === "overview";
  for (let x = -7.5; x <= 7.5; x += 3) for (let z = -13.5; z <= 7.5; z += 3) {
    add("floor-sage", x, z);
    if (!overview) add("ceiling-panel", x, z, 0, 4.25);
  }
  for (let x = -7.5; x <= 7.5; x += 3) { add("wall-straight", x, -15); add("ceiling-fascia", x, -15, 0, 3.5); }
  for (let z = -13.5; z <= 7.5; z += 3) {
    add("window-bay", -9, z, Math.PI / 2);
    add(z < -6 ? "window-bay" : "wall-straight", 9, z, -Math.PI / 2);
    add("ceiling-fascia", -9, z, Math.PI / 2, 3.5); add("ceiling-fascia", 9, z, -Math.PI / 2, 3.5);
  }
  for (const z of [2.0, 0.8, -0.4]) add("ticket-machine", -8.1, z, Math.PI / 2);
  const openings = layout === "straight" ? [-1.5, 1.5] : layout === "dogleg" ? [-4.5, 4.5] : [-4.5, -1.5, 1.5];
  for (let x = -7.5; x <= 7.5; x += 3) {
    const open = openings.includes(x);
    add(open ? "portal" : "wall-straight", x, -1.5);
    if (open) { add("security-arch", x, -1.4); add("marking-queue", x, -0.6); }
  }
  const pillars = layout === "dogleg" ? [[2, 0.5], [-2, -5], [4, -8]] : [[2, 0.5], [-3, -6.5], [3, -7.5]];
  for (const [x, z] of pillars) { const pillar = add("pillar", x, z); pillar.scale.y = 4.2 / 3.5; if (z > 0) columnSign(pillar); }
  if (layout === "dogleg") add("partition", 0, -5);
  for (let i = 0; i < 5; i++) add("fare-gate", 1.2 + i * 1.4, -10.5);
  for (const x of [-7.5, -4.5, -1.5]) add("partition", x, -10.5);
  for (const z of [7.5, 4.5]) add("route-straight", -1.5, z);
  add("route-split", -1.5, 1.5); add("route-turn", -4.5, 1.5, Math.PI / 2); add("route-turn", 1.5, 1.5, Math.PI);
  for (const x of [-4.5, 1.5]) for (const z of [-1.5, -4.5, -7.5]) add("route-straight", x, z);
  add("marking-arrow", -1.5, 6); add("marking-arrow", -4.5, -0.2); add("marking-arrow", 1.5, -8.2);
  sign("自助购票", -8.0, 0.8, 2.65, 3.9, Math.PI / 2);
  sign("↑  安全检查", -1.5, -1.24, 2.7, layout === "split" ? 8.8 : 5.8);
  sign("↑  检票口", 4, -10.3, 2.65, 5.5);
  for (const z of [6, 0, -6, -12]) for (const x of [-6, 0, 6]) add("structural-frame", x, z);
  if (!overview) {
    for (const z of [3, -3, -9]) for (const x of [-6, 0, 6]) add("light-strip", x, z, 0, 4.235);
    for (const z of [5, -3, -10]) {
      const light = new RectAreaLight("#ffe4b8", 3.8, 10, 2.4); light.position.set(0, 4.1, z); light.lookAt(0, 0, z); content.add(light);
    }
    floorReflection();
  }
}
function buildMaterialDisplay() {
  const names = ["kit.terrazzo.ivory", "kit.terrazzo.sage", "kit.plaster.ivory", "kit.coating.ochre", "kit.coating.charcoal", "kit.paint.brick"];
  names.forEach((name, i) => {
    const mat = materialPool.get(name); if (!mat) return;
    const x = (i % 3 - 1) * 3.3, z = Math.floor(i / 3) * 3.3 - 1.65;
    const sphere = new Mesh(new SphereGeometry(0.92, 48, 32), mat); sphere.position.set(x, 1.13, z); sphere.castShadow = true; sphere.userData.previewGeometry = true; content.add(sphere);
    const base = new Mesh(new CylinderGeometry(1.16, 1.16, 0.2, 48), stateMaterials.pale); base.position.set(x, 0.1, z); base.receiveShadow = true; base.userData.previewGeometry = true; content.add(base);
  });
}
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
function refresh() {
  if (!manifest) return;
  clearContent();
  if (mode === "scene") buildRoom(); else if (mode === "materials") buildMaterialDisplay(); else add(selected);
  const entry = manifest.assets.find((a) => a.id === selected && (a.state === state || a.category !== "facility"))!;
  const size = entry.bounds.size.map((n) => n.toFixed(2)).join(" × ");
  element("asset-info").innerHTML = "<strong>" + entry.label + "</strong><p>" + entry.description + "</p><dl><dt>尺寸 / m</dt><dd>" + size + "</dd><dt>三角面</dt><dd>" + entry.triangles.toLocaleString() + "</dd><dt>GLB</dt><dd>" + Math.round(entry.bytes / 1024) + " KB</dd></dl>";
  const download = element<HTMLAnchorElement>("download"); download.href = base + entry.file; download.download = entry.file.split("/").pop()!;
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

async function init() {
  const response = await fetch(base + "manifest.json"); if (!response.ok) throw new Error("Asset manifest HTTP " + response.status);
  manifest = await response.json() as Manifest; validation.expected = manifest.assets.length;
  const loader = new GLTFLoader();
  await Promise.all(manifest.assets.map(async (entry) => {
    try {
      const gltf = await loader.loadAsync(base + entry.file);
      const box = new Box3().setFromObject(gltf.scene), actual = box.getSize(new Vector3()).toArray();
      if (actual.some((value, i) => Math.abs(value - entry.bounds.size[i]) > 0.002)) throw new Error("Round-trip bounds mismatch");
      validation.boundsChecked++;
      gltf.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        node.castShadow = !node.userData.noShadow; node.receiveShadow = true;
        const mat = node.material as MeshStandardMaterial;
        if (materialPool.has(mat.name)) node.material = materialPool.get(mat.name)!; else materialPool.set(mat.name, mat);
      });
      if (entry.state === "open") prototypes.set(entry.id, gltf.scene);
      validation.loaded++;
    } catch (error) { validation.errors.push(entry.file + ": " + String(error)); }
  }));
  if (validation.errors.length) throw new Error(validation.errors.join("; "));
  const unique = manifest.assets.filter((a) => a.state === "open");
  element("asset-count").textContent = unique.length + " 类";
  element("asset-list").innerHTML = unique.map((a) => "<button data-asset=\"" + a.id + "\">" + a.label + "<small>" + (a.category === "facility" ? "FACILITY" : a.category === "architecture" ? "STRUCTURE" : "WAYFINDING") + "</small></button>").join("");
  element("asset-list").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => { selected = b.dataset.asset!; mode = "asset"; refresh(); }));
  element<HTMLAnchorElement>("manifest-link").href = base + "manifest.json";
  element("load-status").textContent = validation.loaded + "/" + validation.expected + " GLB 已载入 · 尺寸复核通过";
  refresh(); validation.ready = true;
}
init().catch((error) => { validation.errors.push(String(error)); element("error").hidden = false; element("error").textContent = "预览加载失败：" + String(error); element("load-status").textContent = "加载失败"; console.error(error); });
