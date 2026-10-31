export type CharacterId="dafeiyu"|"naiwa"|"doubao"|"custom";
const key="agent-go.default-character.v1";
/** 读取本机角色偏好，兼容豆包；未知或不可读记录回退到默认角色。 */
export function readDefaultCharacter():CharacterId{
 try{const value=localStorage.getItem(key);if(value==="naiwa"||value==="doubao"||value==="custom")return value;}catch{/* Storage is optional for appearance. */}return "dafeiyu";
}
/** 保存当前角色标识；浏览器拒绝存储时返回失败而不阻断当前选择。 */
export function saveDefaultCharacter(value:string):boolean{
 try{localStorage.setItem(key,value);return true;}catch{return false;}
}
