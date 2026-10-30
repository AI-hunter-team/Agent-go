import { BoxGeometry, CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry } from "three";

export const box = new BoxGeometry(1, 1, 1);
export const plane = new PlaneGeometry(1, 1);
export const sphere = new SphereGeometry(1, 12, 8);
export const cylinder = new CylinderGeometry(1, 1, 1, 12);
export const coat = new CylinderGeometry(0.19, 0.3, 0.7, 5);
export const colors = {
  chalk: "#eee9dc", white: "#faf7ee", ink: "#292d2a", line: "#d2cebf", ochre: "#c69a44",
  sage: "#7f9485", blue: "#315c65", brick: "#a5533e", grey: "#a6a294", screen: "#b9ceba",
};
export const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new MeshStandardMaterial({ color, roughness: 0.95 })])) as Record<keyof typeof colors, MeshStandardMaterial>;
export const marking = new MeshBasicMaterial({ color: "#c69a44", transparent: true, opacity: 0.36, depthWrite: false });
