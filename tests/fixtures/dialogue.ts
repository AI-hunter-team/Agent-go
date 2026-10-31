import { generatePersona } from "../../src/sim/persona";
import { Rng } from "../../src/sim/rng";
import type { NpcDialogueRequest } from "../../src/shared/types";
export function dialogueFixture(): NpcDialogueRequest {
 const persona=generatePersona(new Rng(1),"normal");
 return {npc:{id:"n1",...persona,alert:{level:"none",cause:null},memory:[],holdings:[],queue:null},speaker:{look:"乘客",holding:[]},goal:"ask_ticket",message:"请给我车票",offer:null,history:[]};
}
