import { useEffect, useRef, useState } from "react";
/** Presentation-only, original synthesized ambience. Never feeds simulation hearing. */
export class DepartureAudio {
  private context:AudioContext|null=null;private master:GainNode|null=null;private hum:OscillatorNode|null=null;
  private footAt=-1;private doorOpen=false;enabled=true;
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){const c=new AudioContext();this.context=c;const gain=c.createGain();gain.gain.value=.16;gain.connect(c.destination);this.master=gain;
        const oscillator=c.createOscillator(),level=c.createGain();oscillator.type="sine";oscillator.frequency.value=92;level.gain.value=.018;oscillator.connect(level).connect(gain);oscillator.start();this.hum=oscillator;}
      void this.context.resume().catch(()=>{});
    }catch{/* A browser without audio can still play the entire journey. */}
  }
  setEnabled(value:boolean){this.enabled=value;if(this.master&&this.context)this.master.gain.setTargetAtTime(value&&!document.hidden?.16:0,this.context.currentTime,.08);}
  update(time:number,walking:boolean,door:number){
    if(!this.context||!this.master||!this.enabled||document.hidden)return;
    if(door>.05&&!this.doorOpen){this.tone(180,.75,.03,65);this.doorOpen=true;}
    if(door===0)this.doorOpen=false;
    if(walking&&(this.footAt<0||time-this.footAt>.48||time<this.footAt)){this.tone(105,.11,.22,45);this.footAt=time;}
    if(!walking)this.footAt=-1;
  }
  private tone(frequency:number,duration:number,volume:number,end:number){
    const c=this.context!,osc=c.createOscillator(),gain=c.createGain();osc.type="triangle";osc.frequency.setValueAtTime(frequency,c.currentTime);osc.frequency.exponentialRampToValueAtTime(end,c.currentTime+duration);
    gain.gain.setValueAtTime(.001,c.currentTime);gain.gain.linearRampToValueAtTime(volume,c.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);osc.connect(gain).connect(this.master!);osc.start();osc.stop(c.currentTime+duration);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  dispose(){this.hum?.stop();this.hum?.disconnect();this.master?.disconnect();void this.context?.close().catch(()=>{});this.context=null;this.master=null;this.hum=null;}
}
export function useDepartureAudio(){
  const ref=useRef<DepartureAudio|null>(null);if(!ref.current)ref.current=new DepartureAudio();
  const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem("agent-go-audio")!=="muted";}catch{return true;}});
  useEffect(()=>{ref.current!.setEnabled(enabled);try{localStorage.setItem("agent-go-audio",enabled?"on":"muted");}catch{}},[enabled]);
  useEffect(()=>{const visibility=()=>ref.current?.setEnabled(enabled);document.addEventListener("visibilitychange",visibility);return()=>document.removeEventListener("visibilitychange",visibility);},[enabled]);
  useEffect(()=>()=>ref.current?.dispose(),[]);
  return {audio:ref.current,enabled,toggle(){const next=!enabled;ref.current!.setEnabled(next);if(next)ref.current!.unlock();setEnabled(next);}};
}
