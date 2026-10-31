import "./style.css";
import {
  ACESFilmicToneMapping, AmbientLight, Box3, BoxGeometry, Color, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Scene, SRGBColorSpace,
  PMREMGenerator, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { setMetroDoorProgress, setMetroLineColor } from "../../src/assets/metro-train/index";
import { METRO_PROFILE } from "../../src/shared/metro";

const host = document.querySelector<HTMLDivElement>("#canvas")!, status = document.querySelector<HTMLSpanElement>("#status")!;
const scene = new Scene(); scene.background = new Color("#e5e9e3");
const renderer = new WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap; host.append(renderer.domElement);
const environment = new RoomEnvironment(), pmrem = new PMREMGenerator(renderer), environmentMap = pmrem.fromScene(environment, 0.04);
scene.environment = environmentMap.texture; scene.environmentIntensity = 0.65; environment.dispose(); pmrem.dispose();
const camera = new PerspectiveCamera(36, 1, 0.1, 300), controls = new OrbitControls(camera, renderer.domElement);
for (const x of [-8,-4.45,-.9,2.65,6.2]) { const light=new PointLight("#fff4df",6,6,2); light.position.set(x,METRO_PROFILE.ceiling-.12,0); scene.add(light); }
controls.minDistance = 3; controls.maxDistance = 135; controls.maxPolarAngle = Math.PI / 2 + 0.03;
scene.add(new HemisphereLight("#f2f7ff", "#b4b8a3", 1.7), new AmbientLight("#ffffff", 0.4));
const key = new DirectionalLight("#fff6e7", 2.2); key.position.set(12, 24, 12); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -45; key.shadow.camera.right = 45; key.shadow.camera.top = 30; key.shadow.camera.bottom = -30; key.shadow.normalBias = 0.035; key.shadow.bias = -0.0001; scene.add(key);
const fill = new DirectionalLight("#d7e8fa", 1.8); fill.position.set(-12, 13, -16); scene.add(fill);
const ground = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ color: "#e3e7df", roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.25; ground.receiveShadow = true; scene.add(ground);
const stage = new Group(), train = new Group(); scene.add(stage, train);
const trackSteel = new MeshStandardMaterial({ color: "#8e9b99", roughness: 0.35, metalness: 0.7 }), trackDark = new MeshStandardMaterial({ color: "#9ba69e", roughness: 0.9 });
let carMode = "head", viewMode = "perspective", lineColor = "#247f76", doorTarget = 0, doorProgress = 0, frame = 0;
const loader = new GLTFLoader();
const models = new Map<string, Group>();
function invalidate() { if (!frame) frame = requestAnimationFrame(render); }
function render() {
  frame = 0;
  if (Math.abs(doorTarget - doorProgress) > 0.001) { doorProgress += Math.sign(doorTarget - doorProgress) * Math.min(0.035, Math.abs(doorTarget - doorProgress)); setMetroDoorProgress(train, doorProgress); invalidate(); }
  else if (doorProgress !== doorTarget) { doorProgress = doorTarget; setMetroDoorProgress(train, doorProgress); }
  renderer.render(scene, camera);
}
function setView(view: string) {
  viewMode = view;
  camera.fov=view === "interior" ? 58 : 36; camera.updateProjectionMatrix();
  const isConsist = carMode === "consist", offset = isConsist ? 23.0 : 0;
  const choices: Record<string, { position: number[]; target: number[] }> = {
    perspective: { position: isConsist ? [54, 24, 61] : [22, 9.5, 24], target: [0, 1.8, 0] },
    front: { position: [offset + 19, 4.2, 5.7], target: [offset + 9, 2.15, 0] },
    side: { position: [0, 4.7, isConsist ? 99 : 35], target: [0, 1.9, 0] },
    roof: { position: isConsist ? [38, 64, 44] : [15, 22, 17], target: [0, 1.6, 0] },
    interior: { position: [1.2, METRO_PROFILE.floor+1.35, .32], target: [5.4, METRO_PROFILE.floor+1.1, .32] },
  };
  const choice = choices[view] ?? choices.perspective;
  camera.position.fromArray(choice.position); controls.target.fromArray(choice.target);
  controls.minDistance=view === "interior" ? .5 : 3;
  if (view !== "front" && view !== "interior") camera.position.sub(controls.target).multiplyScalar(Math.max(1, 1.15 / camera.aspect)).add(controls.target);
  controls.update();
  if (view !== "front" && view !== "interior" && train.children.length) {
    const bounds = new Box3().setFromObject(train);
    for (let pass = 0; pass < 5; pass++) {
      camera.updateMatrixWorld(); let factor = 1;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x, y, z).project(camera); factor = Math.max(factor, Math.abs(p.x) / 0.87, Math.abs(p.y) / 0.76);
      }
      if (factor < 1.001) break;
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update();
    }
  }
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view)); invalidate();
}
function setCar(mode: string) {
  carMode = mode; train.clear();
  const add = (kind: string, x: number, yaw = 0) => { const model = models.get(kind)!.clone(true); model.position.x = x; model.rotation.y = yaw; train.add(model); };
  if (mode === "consist") { add("head", 23); add("trailer", 0); add("head", -23, Math.PI); }
  else add(mode, 0);
  setMetroLineColor(train, lineColor); setMetroDoorProgress(train, doorProgress);
  stage.children.forEach((node) => { if (node instanceof Mesh) node.geometry.dispose(); }); stage.clear();
  const length = mode === "consist" ? 83 : 32;
  for (const z of [-0.8, 0.8]) {
    const rail = new Mesh(new BoxGeometry(length, 0.12, 0.065), trackSteel); rail.position.set(0, -0.06, z); rail.castShadow = true; stage.add(rail);
  }
  for (let x = -length / 2; x <= length / 2; x += 0.7) { const sleeper = new Mesh(new BoxGeometry(0.19, 0.11, 2.28), trackDark); sleeper.position.set(x, -0.165, 0); sleeper.receiveShadow = true; stage.add(sleeper); }
  document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach((button) => button.classList.toggle("active", button.dataset.car === mode));
  const download = document.querySelector<HTMLAnchorElement>("#download")!;
  const kind = mode === "trailer" ? "trailer" : "head"; download.href = `/assets/metro-train/metro-${kind}-car.glb`; download.innerHTML = `下载${kind === "head" ? "车头车" : "中间车"} GLB <span>↓</span>`;
  status.textContent = mode === "consist" ? "实际 GLB · 三车连接示意" : `实际 GLB · ${mode === "head" ? "车头车" : "中间车"} · 20 片独立门扇`;
  setView(viewMode);
}
function resize() { camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); setView(viewMode); }
new ResizeObserver(resize).observe(host); controls.addEventListener("change", invalidate);
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view!)));
document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach((button) => button.addEventListener("click", () => { if (models.size === 2) setCar(button.dataset.car!); }));
document.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((button) => button.addEventListener("click", () => {
  lineColor = button.dataset.color!; setMetroLineColor(train, lineColor);
  document.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((b) => b.classList.toggle("active", b === button));
  document.querySelector<HTMLElement>(".line-badge")!.style.backgroundColor = lineColor; invalidate();
}));
document.querySelector<HTMLButtonElement>("#doors")!.addEventListener("click", (event) => {
  doorTarget = doorTarget ? 0 : 1;
  const button = event.currentTarget as HTMLButtonElement; button.setAttribute("aria-pressed", String(doorTarget === 1)); button.innerHTML = `${doorTarget ? "关闭" : "打开"}双侧车门 <span>↔</span>`; invalidate();
});
async function loadModels() { try {
  const entries = await Promise.all(["head", "trailer"].map(async (kind) => {
    const gltf = await loader.loadAsync(`/assets/metro-train/metro-${kind}-car.glb?v=2`);
    gltf.scene.traverse((node) => { if (node instanceof Mesh) { node.castShadow = !node.material || !(node.material instanceof MeshStandardMaterial) || !node.material.transparent; node.receiveShadow = true; } });
    return [kind, gltf.scene] as const;
  }));
  entries.forEach(([kind, model]) => models.set(kind, model)); setCar("head");
} catch (error) { status.textContent = `模型加载失败：${error instanceof Error ? error.message : String(error)}`; } }
void loadModels();
resize();
// Compact diagnostic surface for asset verification; no game or model API involved.
Object.assign(window, { metroPreviewInspect: () => {
  let doors = 0, meshes = 0; const positions: object[] = [], colors = new Set<string>();
  train.traverse((node) => {
    if (node.userData.role === "metroDoor") { doors++; positions.push({ name: node.name, x: node.position.x, closedX: node.userData.closedX, travel: node.userData.travel }); }
    if (node instanceof Mesh) { meshes++; if (node.material instanceof MeshStandardMaterial && node.material.name === "metro.line.jade") colors.add(node.material.color.getHexString()); }
  });
  return { loaded: models.size === 2, carMode, viewMode, lineColor, doorProgress, doorTarget, doors, meshes, positions, colors: [...colors], drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, camera: camera.position.toArray(), target: controls.target.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray() };
} });
