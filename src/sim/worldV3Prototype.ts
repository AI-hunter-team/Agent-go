import type { WorldDefinition } from "../shared/world";
import { createWorldV2 } from "./worldV2";
import { hydrateWorld, layoutHash, serializableWorld, validateWorld } from "./worldDefinition";
import { populateArchitecturalProps } from "./architecturalProps";
import { propDefinition } from "../shared/stationProps";

/** Frozen first V3 specimen. Retain its geometry and hash for existing saved worlds. */
export function createWorldV3Prototype(seed:number,appearanceSeed=seed):WorldDefinition {
 const source=createWorldV2(seed),d=serializableWorld(source),base=d.layoutHash;
 d.layout.zoneOf=source.layout.zoneOf;d.layout.atRailing=source.layout.atRailing;
 d.generatorVersion="metro-v3";d.name="青禾站 · V3融合样板";
 // Keep the review view centred on an actual gate aperture, with the stairs beyond it.
 d.architecture!.views=d.architecture!.views.map(v=>v.id==="gate"?{...v,eye:[16,1.65,8],target:[32,1.4,13.4]}:v);
 d.props=populateArchitecturalProps(d,appearanceSeed);
 d.layout.solids=[...(d.layout.solids??[]),...d.props.flatMap(p=>p.body?[p.body]:[])];
 d.layout.SIGHT_OCCLUDERS.push(...d.props.flatMap(p=>p.body&&propDefinition(p.assetId).blocksSight?[p.body]:[]));
 d.layoutHash=layoutHash({version:"metro-v3",base,architecture:d.architecture,props:d.props});
 const errors=validateWorld(d);if(errors.length)throw new Error(`V3融合样板无效: ${errors.join(", ")}`);
 return hydrateWorld(d);
}
