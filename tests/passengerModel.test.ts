import { expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { personRadius } from "../src/sim/movement";
import { createPassengerModel, posePassenger } from "../src/ui/scene/passengerModel";
import { passengerAppearance, type CrowdKind } from "../src/ui/scene/passengerAppearance";

const kinds: CrowdKind[] = ["normal", "elderly", "luggage", "hurried"];
const variants = new Map<number, string>();
for (let i = 0; i < 2048 && variants.size < 32; i++) {
  const id = `npc-${i}`;
  variants.set(passengerAppearance("normal", id).variant, id);
}

it("所有乘客款式脚底对齐、接近现有角色身高，行走轮廓不超出既有避让半径", () => {
  expect(variants.size).toBe(32);
  for (const kind of kinds) for (const [variant, id] of variants) {
    const model = createPassengerModel(kind, id);
    const box = new Box3().setFromObject(model.root);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.002);
    expect(box.min.y).toBeLessThan(0.02);
    expect(box.max.y).toBeGreaterThan(1.55);
    expect(box.max.y).toBeLessThan(1.75);
    for (let frame = 0; frame < 8; frame++) {
      posePassenger(model, kind, "walk", frame * Math.PI / 4 / (kind === "hurried" ? 12 : 9), false);
      model.root.updateMatrixWorld(true);
      const vertex = new Vector3();
      let radius = 0;
      model.root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
          radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
        }
      });
      expect(radius, `${kind}:${variant}:${frame}`).toBeLessThanOrEqual(personRadius(kind));
    }
  }
});

it("每种行为类型都覆盖男女各四种结构、每款四种颜色，性别与轮廓不因行为类型改变", () => {
  for (const kind of kinds) {
    const looks = [...variants.values()].map(id => passengerAppearance(kind, id));
    for (const gender of ["male", "female"]) {
      const genderLooks = looks.filter(look => look.gender === gender);
      expect(genderLooks).toHaveLength(16);
      expect(new Set(genderLooks.map(look => look.hairStyle)).size).toBe(4);
      expect(new Set(genderLooks.map(look => look.outfit)).size).toBe(4);
      for (const style of new Set(genderLooks.map(look => look.style))) {
        const colors = genderLooks.filter(look => look.style === style);
        expect(new Set(colors.map(look => look.coat)).size).toBe(4);
      }
    }
    for (const id of variants.values()) {
      const samePerson = passengerAppearance("normal", id), look = passengerAppearance(kind, id);
      expect(look.gender).toBe(samePerson.gender);
      expect(look.hairStyle).toBe(samePerson.hairStyle);
      expect(look.outfit).toBe(samePerson.outfit);
    }
    const heads = new Set(), bodies = new Set();
    for (let style = 0; style < 8; style++) {
      const model = createPassengerModel(kind, variants.get(style)!);
      const head = model.head.children[0] as Mesh;
      const body = model.upper.children[0].children[0] as Mesh;
      // 比较未着色的真实顶点，不把颜色差异当作结构差异。
      heads.add(JSON.stringify(Array.from(head.geometry.getAttribute("position").array)));
      bodies.add(JSON.stringify(Array.from(body.geometry.getAttribute("position").array)));
    }
    expect(heads.size).toBe(8);
    expect(bodies.size).toBe(8);
  }
});

it("重复人物共享网格而不共享关节，重挂载/回放不改变配色且细节不增加独立绘制批次", () => {
  for (const kind of kinds) {
    const a = createPassengerModel(kind, "passenger-1"), b = createPassengerModel(kind, "passenger-1");
    expect(passengerAppearance(kind, "passenger-1")).toEqual(passengerAppearance(kind, "passenger-1"));
    const meshes: Mesh[] = [];
    a.root.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes.length).toBeLessThanOrEqual(7);
    expect((a.head.children[0] as Mesh).geometry).toBe((b.head.children[0] as Mesh).geometry);
    posePassenger(a, kind, "walk", 0.15, false);
    expect(b.legs[0].rotation.x).toBe(0);
    expect(a.legs[0].rotation.x).not.toBe(0);
    expect(new Set(meshes.map(mesh => mesh.material)).size).toBe(1);
  }
});

it("展示时间相同时动作完全复现，减少动态效果停止步态，办理仍抬手", () => {
  const model = createPassengerModel("normal", "npc-1");
  posePassenger(model, "normal", "walk", 0.1, false);
  const pose = model.root.toJSON();
  posePassenger(model, "normal", "walk", 0.1, false);
  expect(model.root.toJSON()).toEqual(pose);
  posePassenger(model, "normal", "walk", 0.2, true);
  expect(model.root.position.y).toBe(0);
  expect(model.legs[0].rotation.x).toBe(0);
  posePassenger(model, "normal", "interact", 0.2, true);
  expect(model.arms[0].rotation.x).toBeLessThan(0);
});
