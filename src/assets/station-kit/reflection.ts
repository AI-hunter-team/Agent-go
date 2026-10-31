import { Color, PlaneGeometry, type ShaderMaterial } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

const mirrors = new Set<Reflector>();
/** Same soft, low-opacity terrazzo reflection in the game and asset showroom. */
export function createFloorReflection(width: number, depth: number, x: number, z: number, elevation = 0) {
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
      "#include <tonemapping_fragment>", "#include <colorspace_fragment>", "}",
    ].join("\n"),
  };
  const mirror = new Reflector(new PlaneGeometry(width, depth), {
    color: "#eae7dc", textureWidth: 768, textureHeight: 512, clipBias: 0.003, multisample: 0, shader,
  });
  mirror.name = "station_floor_reflection"; mirror.rotation.x = -Math.PI / 2; mirror.position.set(x, elevation + 0.004, z);
  const material = mirror.material as ShaderMaterial; material.transparent = true; material.depthWrite = false;
  const render = mirror.onBeforeRender.bind(mirror);
  mirror.onBeforeRender = (...args) => {
    if (args[1].overrideMaterial) return; // Exclude SSAO/depth override passes.
    const visibility = [...mirrors].map((item) => [item, item.visible] as const);
    // All levels must disappear from each reflection pass, preventing recursion.
    visibility.forEach(([item]) => { item.visible = false; });
    try { render(...args); } finally { visibility.forEach(([item, visible]) => { item.visible = visible; }); }
  };
  mirrors.add(mirror); return mirror;
}

export function disposeFloorReflection(mirror: Reflector) {
  mirrors.delete(mirror); mirror.dispose(); mirror.geometry.dispose();
}
