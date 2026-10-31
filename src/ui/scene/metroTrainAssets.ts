import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** A rejected load is not cached, so the existing retry action can recover. */
export function createMetroTrainLoader(load: (url: string) => Promise<Group> = async (url) => (await new GLTFLoader().loadAsync(url)).scene) {
  let pending: Promise<Group> | undefined;
  return (url: string): Promise<Group> => {
    if (!pending) pending = load(url).catch((error: unknown) => { pending = undefined; throw error; });
    return pending;
  };
}
export const loadMetroTrain = createMetroTrainLoader();
