import { BoxGeometry, Group, Mesh, Object3D, type MeshStandardMaterial } from "three";

export const RAILING_HEIGHT = 1.1;
const unit = new BoxGeometry(1, 1, 1);
unit.computeTangents();
type RailMaterials = { steel: MeshStandardMaterial; ink: MeshStandardMaterial; ochre: MeshStandardMaterial };

function piece(name: string, size: [number, number, number], position: [number, number, number], material: MeshStandardMaterial) {
  const mesh = new Mesh(unit, material); mesh.name = name;
  mesh.scale.set(...size); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function anchor(name: string, x: number, z = 0) {
  const node = new Object3D(); node.name = name; node.position.set(x, 0, z); node.userData.role = "anchor"; return node;
}

/** Rebuild a span from exported component prototypes; never stretch posts or balusters. */
export function fitRailingSpan(prototype: Object3D, length: number, startPost = true, endPost = true): Group {
  if (!Number.isFinite(length) || length < 0.32) throw new Error("Railing span must be at least 0.32m.");
  const root = new Group(); root.name = "railing-span";
  root.userData = { assetId: "railing-straight", spanMetres: length, heightMetres: RAILING_HEIGHT };
  const part = (name: string) => {
    const source = prototype.getObjectByName(name);
    if (!source) throw new Error("Missing railing component: " + name);
    return source.clone(true);
  };
  const half = length / 2 - 0.08;
  for (const [sign, include] of [[-1, startPost], [1, endPost]] as const) {
    if (!include) continue;
    const post = part("railing_post"); post.position.set(sign * half, 0, 0); root.add(post);
  }
  for (const name of ["railing_handrail", "railing_lower_rail"]) {
    const rail = part(name); rail.position.x = 0; rail.scale.x = half * 2; root.add(rail);
  }
  const count = Math.ceil(half * 2 / 0.14);
  for (let i = 1; i < count; i++) {
    const bar = part("railing_baluster"); bar.position.x = -half + half * 2 * i / count; root.add(bar);
  }
  // Connections meet at post centres: adjoining modules overlap the same footplate.
  root.add(anchor("anchor_start", -half), anchor("anchor_end", half));
  return root;
}

export function createRailingAsset(id: string, materials: RailMaterials): Group {
  const template = new Group(), post = new Group(); post.name = "railing_post";
  post.add(piece("post_base", [0.16, 0.025, 0.16], [0, 0.0125, 0], materials.ink));
  post.add(piece("post_stem", [0.055, 1.06, 0.055], [0, 0.555, 0], materials.steel));
  post.add(piece("post_cap", [0.075, 0.025, 0.075], [0, 1.0875, 0], materials.ochre));
  template.add(post,
    piece("railing_handrail", [1, 0.065, 0.065], [0, 1.0675, 0], materials.steel),
    piece("railing_lower_rail", [1, 0.035, 0.035], [0, 0.19, 0], materials.steel),
    piece("railing_baluster", [0.022, 0.86, 0.022], [0, 0.6225, 0], materials.steel));
  if (id === "railing-straight") return fitRailingSpan(template, 3);
  const root = new Group();
  if (id === "railing-end") root.add(post.clone(true), anchor("anchor_start", 0), anchor("anchor_end", 0));
  else {
    const a = fitRailingSpan(template, 1.5), b = fitRailingSpan(template, 1.5, false);
    a.position.z = -0.67; b.position.x = -0.67; b.rotation.y = -Math.PI / 2;
    for (const span of [a, b]) for (const node of [...span.children]) if (node.userData.role === "anchor") span.remove(node);
    root.add(a, b, anchor("anchor_start", 0.67, -0.67), anchor("anchor_end", -0.67, 0.67));
  }
  return root;
}
