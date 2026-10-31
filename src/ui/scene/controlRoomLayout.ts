import { Matrix4, Vector3 } from "three";
import { LOUNGE } from "./loungeLayout";
import type { WorldDefinition } from "../../shared/world";
import type { ActorPose } from "../presentation";
import type { GameSession } from "../gameSession";
import type { JourneyStage } from "../journeyFlow";
export type Triple=[number,number,number];
/** The fixed room docks onto A's stair top. Simulation coordinates never move. */
export function entranceDock(world:WorldDefinition){
  const e=world.entrances?.find(e=>e.id==="A")??world.entrances?.[0];
  const yaw=e?Math.atan2(e.inward.x,-e.inward.y):0;
  const matrix=new Matrix4().makeRotationY(yaw);
  if(e){const origin=new Vector3(e.top.x,e.top.elevation,e.top.y).applyMatrix4(matrix);matrix.setPosition(origin.negate());}
  const inverse=matrix.clone().invert();
  return {matrix,inverse,yaw,toScene:(v:Vector3)=>v.applyMatrix4(matrix),toMap:(v:Vector3)=>v.applyMatrix4(inverse)};
}
const route=LOUNGE.route;
const cameraRoute:Triple[]=[LOUNGE.eye,[-4.3,2.5,5.8],[-4.2,2.35,4],[0,2.56,4.15],[0,2.56,4.15]];
function sample(points:Triple[],progress:number,out:Vector3){
  const value=Math.max(0,Math.min(1,progress))*(points.length-1),index=Math.min(points.length-2,Math.floor(value));
  return out.fromArray(points[index]).lerp(new Vector3(...points[index+1]),value-index);
}
/** Pure display timeline: it cannot step the engine, consume a seed, or change the player. */
export class ControlRoomState {
  stage:JourneyStage="lobby"; active=true; elapsed=0; time=0; delta=0; walking=false; notified=false; handoff=false; door=0; moving=false;
  pose:ActorPose={x:0,y:0,z:0,yaw:0};
  fov=52;readonly eye=new Vector3(...LOUNGE.eye);readonly target=new Vector3(...LOUNGE.target);
  readonly actor=new Vector3(...LOUNGE.actor);readonly desiredEye=new Vector3();readonly desiredTarget=new Vector3();
  private departureRoute:Triple[]=cameraRoute.map(p=>[...p]);
  private previous:JourneyStage="lobby";private heading=0;
  update(stage:JourneyStage,delta:number,ready:boolean,fast:boolean,dock:ReturnType<typeof entranceDock>,narrow:boolean){
    if(stage!==this.previous){if(stage==="launch"){this.departureRoute[0]=this.eye.toArray();this.elapsed=0;this.notified=false;this.handoff=false;}else if(stage!=="watch"){this.elapsed=0;this.door=0;this.heading=0;}this.previous=stage;}
    this.stage=stage;this.active=stage!=="watch";this.delta=Math.max(0,Math.min(.1,delta));this.time+=this.delta;
    if(!this.active){this.walking=false;return;}
    if(stage==="launch"&&ready)this.elapsed=Math.min(8,this.elapsed+this.delta*(fast?3:1));
    this.door=stage==="launch"?Math.min(1,Math.max(0,this.elapsed/.8)):0;
    this.walking=stage==="launch"&&this.elapsed>.8&&this.elapsed<8;
    if(stage==="launch"&&this.elapsed>.8){
      const progress=(this.elapsed-.8)/7.2;sample(route,progress,this.actor);sample(this.departureRoute,progress,this.desiredEye);
      this.desiredTarget.copy(this.actor);this.desiredTarget.y=1.25;
      const step=new Vector3();sample(route,Math.min(1,progress+.001),step).sub(this.actor);
      const yaw=step.lengthSq()>.00000001?Math.atan2(step.x,step.z):Math.PI;
      const turn=Math.atan2(Math.sin(yaw-this.heading),Math.cos(yaw-this.heading));this.heading+=turn*Math.min(1,this.delta*12);
      if(this.elapsed===8)this.heading=Math.PI;
    }else{
      this.actor.set(...LOUNGE.actor);this.heading=narrow?.6:-.2;
      const character=stage==="character";
      this.desiredEye.set(...(character?[-5.95,1.7,6.5] as Triple:LOUNGE.eye));
      this.desiredTarget.set(...(character?[-4.85,1,3.5] as Triple:LOUNGE.target));
      if(narrow){
        this.desiredEye.set(...(character?[-5.65,1.7,7.4] as Triple:LOUNGE.narrowEye));
        this.desiredTarget.set(...(character?[-5.65,.65,3.5] as Triple:LOUNGE.narrowTarget));
      }
    }
    this.fov=stage==="launch"?(narrow?58:52)+(58-(narrow?58:52))*Math.min(1,this.elapsed/8):narrow?58:52;

    if(stage==="world"){this.desiredEye.copy(this.eye);this.desiredTarget.copy(this.target);}
    const blend=1-Math.exp(-this.delta*(stage==="launch"?9:7));
    this.eye.lerp(this.desiredEye,blend);this.target.lerp(this.desiredTarget,blend);
    this.moving=this.eye.distanceToSquared(this.desiredEye)+this.target.distanceToSquared(this.desiredTarget)>.000001;
    const mapped=this.actor.clone().applyMatrix4(dock.inverse);this.pose.x=mapped.x;this.pose.y=mapped.y;this.pose.z=mapped.z;this.pose.yaw=this.heading-dock.yaw;
  }
  get complete(){return this.elapsed>=8;}
}
const states=new WeakMap<GameSession,ControlRoomState>();
export function controlRoomState(session:GameSession){let state=states.get(session);if(!state){state=new ControlRoomState();states.set(session,state);}return state;}
