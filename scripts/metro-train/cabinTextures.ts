import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let b=0;b<8;b++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(name:string,bytes:Buffer) {
  const body=Buffer.concat([Buffer.from(name),bytes]);let crc=0xffffffff;
  for(const b of body)crc=crcTable[(crc^b)&255]^(crc>>>8);
  const length=Buffer.alloc(4),tail=Buffer.alloc(4);length.writeUInt32BE(bytes.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,body,tail]);
}
function png(size:number,data:Uint8Array) {
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc(size*(size*4+1));for(let y=0;y<size;y++)Buffer.from(data.buffer,y*size*4,size*4).copy(raw,y*(size*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}
/** Original seeded anti-slip vinyl grain, 2m tiling; all three PBR maps are embedded in GLB. */
export async function generateCabinTextures(directory:string) {
  const size=256,color=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
  let seed=5927;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<size*size;i++) {
    const grain=random(),base=grain<.04?180+random()*35:grain>.97?255:241+random()*12;
    color.set([base,base,base,255],i*4);
    normal.set([127+random()*2,127+random()*2,255,255],i*4);
    roughness.set([255,204+random()*20,0,255],i*4);
  }
  for(const [kind,data] of [["color",color],["normal",normal],["roughness",roughness]] as const)
    await writeFile(join(directory,`cabin-floor-${kind}.png`),png(size,data));
}
