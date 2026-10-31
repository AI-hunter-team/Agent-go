import { DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Texture, UnsignedByteType } from "three";
import { surfacePixels, SURFACE_METRES, type SurfaceKind } from "../../assets/world-surfaces";
import type { StationKit } from "./stationAssets";

export type SurfaceName = "stone" | "sage" | "wall" | "steel" | "concrete" | "dark" | "rubber" | "tactile" | "paint" | "jade" | "red" | "ribbed" | "glass" | "light" | "screen";
export type GeneratedPalette = Record<SurfaceName, MeshStandardMaterial> & { dispose: () => void };
export function createGeneratedPalette(kit?: StationKit): GeneratedPalette {
  const textures: Texture[] = [], maps = new Map<SurfaceKind, { map: DataTexture; normalMap: DataTexture; roughnessMap: DataTexture }>();
  const mapped = (kind: SurfaceKind) => {
    if (maps.has(kind)) return maps.get(kind)!;
    const pixels = surfacePixels(kind);
    const texture = (data: Uint8Array<ArrayBuffer>, color = false) => {
      const result = new DataTexture(data, pixels.size, pixels.size, RGBAFormat, UnsignedByteType);
      result.name = `world.${kind}.${color ? "color" : "data"}`; result.wrapS = result.wrapT = RepeatWrapping;
      result.generateMipmaps = true; result.minFilter = LinearMipmapLinearFilter; result.magFilter = LinearFilter; result.anisotropy = 4; if (color) result.colorSpace = SRGBColorSpace; result.needsUpdate = true; textures.push(result); return result;
    };
    const value = { map: texture(pixels.color, true), normalMap: texture(pixels.normal), roughnessMap: texture(pixels.roughness) }; maps.set(kind, value); return value;
  };
  const mat = (name: SurfaceName, color: string, kind: SurfaceKind, metalness = 0) => {
    const m = new MeshStandardMaterial({ color, metalness, roughness: 1, ...mapped(kind) });
    m.name = `world.${name}`; m.normalScale.setScalar(kind === "tactile" ? .65 : .2); m.userData.metres = SURFACE_METRES[kind]; return m;
  };
  const result = {
    stone: mat("stone", "#e7e3d5", "stone"), sage: mat("sage", "#a3b2a4", "stone"), wall: mat("wall", "#f0ebdf", "plaster"),
    steel: mat("steel", "#b5c1bf", "steel", .72), concrete: mat("concrete", "#a0aaa3", "concrete"), dark: mat("dark", "#38463f", "concrete"),
    rubber: mat("rubber", "#202d2b", "rubber"), tactile: mat("tactile", "#d6ac4c", "tactile"), paint: mat("paint", "#e8e9e2", "paint", .18),
    jade: mat("jade", "#247f76", "paint", .2), red: mat("red", "#aa4e39", "paint", .2), ribbed: mat("ribbed", "#9caeaa", "ribbed", .65),
    glass: new MeshStandardMaterial({ name: "world.glass", color: "#a5c9bc", transparent: true, opacity: .24, roughness: .2, metalness: .08, side: DoubleSide, depthWrite: false }),
    light: new MeshStandardMaterial({ name: "world.light", color: "#fff8df", emissive: "#fff0c8", emissiveIntensity: .8, roughness: .35 }),
    screen: new MeshStandardMaterial({ name: "world.screen", color: "#6faca0", emissive: "#3a665b", emissiveIntensity: .35, roughness: .3 }),
  };
  result.ribbed.userData.crossGrain=true;
  // Formal project terrazzo/plaster maps take precedence; the loader owns their textures.
  for (const [name, sourceName] of [["stone", "kit.terrazzo.ivory"], ["sage", "kit.terrazzo.sage"], ["wall", "kit.plaster.ivory"]] as const) {
    const source = kit?.materials.get(sourceName); if (!source?.map) continue;
    const target = result[name]; target.map = source.map; target.normalMap = source.normalMap; target.roughnessMap = source.roughnessMap; target.normalScale.copy(source.normalScale); target.userData.metres = 3;
  }
  return { ...result, dispose: () => { Object.values(result).forEach(m => m.dispose()); textures.forEach(t => t.dispose()); } };
}
