/** Shared metre-space anchors for models, framing and the untimed departure. */
export const LOUNGE={
 actor:[-5.65,0,3.5] as [number,number,number],seat:[-5.35,0,1.13] as [number,number,number],table:[-6.88,0,1.3] as [number,number,number],
 brand:[-10.5,1.86,.425] as [number,number,number],brandWidth:3.65,door:[-3.03,0,3.5] as [number,number,number],
 eye:[-8,1.95,9] as [number,number,number],target:[-5.9,.72,1.2] as [number,number,number],
 narrowEye:[-2.65,2.7,7.25] as [number,number,number],narrowTarget:[-6.81,.4,2.39] as [number,number,number],
 route:[[-5.65,0,3.5],[-4.6,0,3.5],[-2,0,3.5],[0,0,3.5],[0,0,0]] as [number,number,number][],
} as const;
