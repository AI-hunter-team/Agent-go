export type CharacterId="dafeiyu"|"naiwa"|"custom";
const key="agent-go.default-character.v1";
export function readDefaultCharacter():CharacterId{
 try{const value=localStorage.getItem(key);if(value==="naiwa"||value==="custom")return value;}catch{/* Storage is optional for appearance. */}return "dafeiyu";
}
export function saveDefaultCharacter(value:string):boolean{
 try{localStorage.setItem(key,value);return true;}catch{return false;}
}
