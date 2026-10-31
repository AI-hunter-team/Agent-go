import { CanvasTexture, MeshStandardMaterial, Mesh, PlaneGeometry, SRGBColorSpace, DoubleSide } from 'three';
import type { WorldDefinition } from '../../shared/world';
const captions:Record<string,string[]>={ 'screen-door':['站台门','请先下后上'],'bin-double':['可回收物  /  其他垃圾','请分类投放'],'bin-slim':['其他垃圾','保持环境整洁'], 'lightbox':['城市漫游','下一站，遇见好风景'], 'notice-board':['车站公告','文明乘车 · 安全出行'], 'station-map':['本站导览','出口与服务设施'], 'fare-map':['乘车指南','购票 → 安检 → 检票 → 站台'], 'platform-display':['候车服务','请先下后上  留意站台间隙'],'aed':['AED 自动体外除颤器','紧急救助设施'],'fire-cabinet':['消防设施','请勿遮挡'],'help-panel':['紧急求助','呼叫按钮'],'equipment-door':['设备用房','非请勿入'],'police-door':['警务室','POLICE'],'toilet-door':['卫生间','RESTROOM'],'lift-door':['无障碍电梯','ACCESSIBLE'],'service-window':['乘客服务中心','问询 · 票务服务'],'locker':['便民寄存','自行保管好随身物品'],'vending':['清泉饮品','饮水 · 便民服务'],'charging':['共享充电','便民服务'],'flower-cabinet':['今日花事','鲜花 · 让旅途更明亮'],'photo-booth':['即刻留影','自助拍照'],'toy-cabinet':['小小旅伴','原创城市玩具'],'wet-sign':['小心地滑','收纳备用']};
export function propGraphic(id:string,variant:number,world?:WorldDefinition,label?:string){
 if(typeof document==='undefined'||!captions[id])return null;
 const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d')!;
 ctx.fillStyle=variant?'#e9e4d6':'#edf1e7';ctx.fillRect(0,0,512,256);ctx.fillStyle='#315c51';ctx.fillRect(0,0,512,12);
 const lines=[...captions[id]];if(label)lines[0]=label;if(id==='station-map'&&world)lines[0]=world.name+' · 导览';
 ctx.textAlign='center';ctx.fillStyle='#25483f';ctx.font='bold 32px Microsoft YaHei,sans-serif';ctx.fillText(lines[0],256,63,480);
 ctx.font='20px Microsoft YaHei,sans-serif';ctx.fillText(lines[1],256,102,480);
 if(id==='lightbox'){ctx.fillStyle=variant?'#c99569':'#9aaa8c';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(70+i*90,200,20+(i%3)*9,0,7);ctx.fill();}ctx.fillStyle='#315c51';ctx.fillRect(30,229,452,3);}
 else if(id==='station-map'&&world){ctx.strokeStyle='#538b78';ctx.lineWidth=4;ctx.strokeRect(65,130,380,90);for(const f of world.layout.FACILITIES){ctx.fillStyle=f.kind==='tvm'?'#ba9855':'#538b78';ctx.fillRect(65+f.pos.x/world.layout.WIDTH*380,130+f.pos.y/world.layout.HEIGHT*90,6,6);}ctx.fillStyle='#25483f';ctx.font='16px Microsoft YaHei';ctx.fillText('B1站厅   ↓ 楼梯 / 扶梯 ↓   B2站台',256,245);}
 else{ctx.strokeStyle='#a2b4a3';ctx.lineWidth=3;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(50,145+i*24);ctx.lineTo(460-(i%2)*70,145+i*24);ctx.stroke();}}
 const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;const material=new MeshStandardMaterial({map:t,roughness:.65,side:DoubleSide});material.name='detail.graphic.'+id;const mesh=new Mesh(new PlaneGeometry(1,.5),material);mesh.name='graphic_'+id;return {mesh,dispose:()=>{mesh.geometry.dispose();material.dispose();t.dispose();}};
}
