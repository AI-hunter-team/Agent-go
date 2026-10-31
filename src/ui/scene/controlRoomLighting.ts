/** Display-only lighting profiles; the station's established values return before timed entry. */
export const CONTROL_ROOM_LIGHTING = Object.freeze({ hemisphere:.45, ambient:.1, environment:.24, key:1.1, points:[6,3,8] as const });
export function stationLightBlend(state:{active:boolean;actor:{x:number}}):number{
  if(!state.active)return 1;
  const progress=Math.max(0,Math.min(1,(state.actor.x+4)/4));
  return progress*progress*(3-2*progress);
}
