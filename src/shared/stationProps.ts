import type { Vec } from './types';
import type { Rect } from '../sim/geometry';
export interface PropDefinition { id:string; label:string; category:string; size:[number,number,number]; mount:'floor'|'wall'|'ceiling'|'surface'; solid:boolean; blocksSight:boolean; useDepth:number; anchors:{name:string;position:[number,number,number]}[] }
const make=(id:string,label:string,category:string,size:[number,number,number],mount:PropDefinition['mount']='floor',solid=true,blocksSight=false,useDepth=.7):PropDefinition=>({id,label,category,size,mount,solid,blocksSight,useDepth,anchors:[{name:'approach',position:[0,0,size[2]/2+useDepth]}]});
export const STATION_PROPS:PropDefinition[]=[
make('bin-double','双分类金属垃圾桶','公共设施',[1.05,1.05,.48]),make('bin-slim','靠墙分类垃圾桶','公共设施',[.55,1.08,.36]),
make('plant-round','圆盆阔叶绿植','绿植',[.8,1.65,.8]),make('plant-square','方盆细叶绿植','绿植',[.8,1.6,.8]),make('plant-box','长条灌木花箱','绿植',[1.8,1.15,.8]),
make('bench-metal','不锈钢联排座椅','公共设施',[2.4,1.08,.72]),make('bench-sage','灰绿候车座椅','公共设施',[3,1.15,.72]),
make('lightbox','城市文化广告灯箱','信息',[1.6,2,.12],'wall',false),make('notice-board','车站公告栏','信息',[1.8,1.4,.1],'wall',false),make('station-map','站区与出口图','信息',[1.5,1.3,.08],'wall',false),make('fare-map','票价及乘车说明','信息',[1.1,1.1,.08],'wall',false),make('platform-display','站台服务信息屏','信息',[1.5,.6,.14],'ceiling',false),
make('vending','综合饮料售货机','便民商业',[1.05,2.05,.85],'floor',true,true,1.1),make('charging','共享充电设备','便民商业',[.38,1.35,.3]),make('locker','便民寄存柜','便民商业',[1.8,2.05,.55],'floor',true,true,1.1),make('flower-cabinet','鲜花自助柜','便民商业',[1.05,2.05,.65],'floor',true,true,1),make('photo-booth','自助拍照亭','便民商业',[1.3,2.2,.9],'floor',true,true,1),make('toy-cabinet','原创玩具售货机','便民商业',[1.05,2.05,.65],'floor',true,true,1),make('flower-cart','鲜花陈列推车','便民商业',[1.5,1.3,.65]),
make('security-table','安检整理台与托盘','运营设施',[1.8,1.05,.7]),make('staff-chair','工作人员座椅','运营设施',[.5,.95,.5]),make('storage-cabinet','安检收纳柜','运营设施',[.8,1.15,.45]),
make('fire-cabinet','消防设施箱','运营设施',[.75,1.4,.18],'wall',false),make('aed','AED急救柜','运营设施',[.45,.65,.18],'wall',false),make('help-panel','紧急求助面板','运营设施',[.22,.4,.08],'wall',false),
make('cleaning-cart','保洁工具收纳车','运营设施',[.8,1.1,.5]),make('mop-bucket','拖把桶与拖把','运营设施',[.4,1.25,.4]),make('wet-sign','折叠警示牌','运营设施',[.34,.65,.13]),make('barrier-store','隔离栏杆收纳组','运营设施',[.65,1,.45]),
make('equipment-door','设备房检修门','建筑细部',[1.2,2.5,.12],'wall',false),make('service-window','乘客服务窗口','建筑细部',[2.2,2.4,.3],'wall',false),make('police-door','警务室门','建筑细部',[1.2,2.5,.12],'wall',false),make('toilet-door','卫生间入口','建筑细部',[1.2,2.5,.12],'wall',false),make('lift-door','无障碍电梯门厅','建筑细部',[1.8,2.7,.15],'wall',false),
make('vent','送排风百叶','顶部设施',[.85,.28,.12],'wall',false),make('speaker','公共广播喇叭','顶部设施',[.24,.3,.16],'ceiling',false),make('cctv','半球监控摄像头','顶部设施',[.22,.28,.22],'ceiling',false),make('smoke-detector','烟感探测器','顶部设施',[.14,.06,.14],'ceiling',false),make('ceiling-light','吊装照明灯具','顶部设施',[1.5,.18,.18],'ceiling',false),
make('skirting','墙面踢脚与接缝','建筑细部',[3,.16,.04],'wall',false),make('column-trim','柱脚与护角','建筑细部',[1.25,.25,1.55],'surface',false),make('access-panel','墙面检修盖板','建筑细部',[.5,.7,.035],'wall',false),make('drain','入口排水沟盖板','建筑细部',[2,.025,.22],'surface',false),make('screen-door','全高站台屏蔽门','站台设施',[1.6,3,.12],'floor',false),make('queue-mark','先下后上候车标识','站台设施',[1.6,.01,1.2],'surface',false)
];
export type PropAssetId=typeof STATION_PROPS[number]['id'];
export const propDefinition=(id:string):PropDefinition=>{const d=STATION_PROPS.find(a=>a.id===id);if(!d)throw new Error('未知物件 '+id);return d;};
export type PropCluster='entrance'|'convenience'|'rest'|'security'|'platform'|'maintenance';
export interface PropPlacement {id:string;assetId:string;variant:number;pos:Vec;elevation:number;yaw:number;cluster:PropCluster;body:Rect|null;useSpace:Rect|null;label?:string}
