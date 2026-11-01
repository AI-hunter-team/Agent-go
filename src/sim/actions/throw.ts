import type { Vec } from "../../shared/types";
import { dist, segmentIntersectsRect } from "../geometry";
import * as legacyLayout from "../layout";
import type {StationLayout} from "../../shared/world";
import { facilitySolids } from "../facilityGeometry";

export const THROW_RANGE = 6;

/** A bounded ground-plane throw. Solid furniture stops flight; low transparent railing is not a wall.
 * Both the animation and noise use this actual endpoint, never the requested remote coordinate. */
export function settleThrow(from: Vec, requested: Vec, layout:StationLayout=legacyLayout): { point: Vec; adjustment: string } {
  const obstacles=[...layout.PILLARS,...layout.ATTRACTIONS.flatMap(a=>a.body?[a.body]:[]),...layout.FACILITIES.flatMap(f=>facilitySolids(f.kind,f.pos,f.queueDirection)),...(layout.solids??[])].filter(r=>!r.floorId||r.floorId===(from.floorId??"concourse"));
  const {WIDTH,HEIGHT}=layout;
  const distance = dist(from, requested), length = Math.min(distance, THROW_RANGE);
  const desired = distance ? {x:from.x+(requested.x-from.x)*length/distance,y:from.y+(requested.y-from.y)*length/distance} : {...from};
  let point = {...from}, blocked = false;
  const steps = Math.max(1, Math.ceil(length / .025));
  for (let i=1; i<=steps; i++) {
    const next = {...from,x:from.x+(desired.x-from.x)*i/steps,y:from.y+(desired.y-from.y)*i/steps};
    if (next.x<.15 || next.x>WIDTH-.15 || next.y<.15 || next.y>HEIGHT-.15 || obstacles.some(r=>segmentIntersectsRect(point,next,{x:r.x-.12,y:r.y-.12,w:r.w+.24,h:r.h+.24}))) {blocked=true;break;}
    point = next;
  }
  return {point,adjustment:[distance>THROW_RANGE?`目标距离${distance.toFixed(1)}米，按${THROW_RANGE}米投掷能力结算`:"",blocked?"途中遇到障碍或边界，物品将在近侧落地":""].filter(Boolean).join("；")};
}
