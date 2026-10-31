import { ASSETS } from "../assets/station-kit";
import { METRO_RAILING_ASSETS } from "../assets/metro-railings";
import type { DetailPlacement } from "../shared/world";
import type { SurfaceName } from "../ui/scene/generatedSurfaces";

export type ViewMode = "room" | "asset" | "material";
export interface Exhibit { id: string; label: string; category: string; description: string; kind: "kit" | "train" | "stairs" | "escalator" | "entrance" | "detail" | "control"; ref: string; family?: DetailPlacement["family"]; }
const details: [DetailPlacement["family"], string, string][] = [
  ["entrance","入口公告与线路图","公告面板、线路示意与金属边框，布置在入站后的停留区。"],
  ["tickets","票务服务窗口","石材台面、玻璃窗口与咨询设备，配合自动售票机使用。"],
  ["security","安检工作台与托盘","金属工作台、下层置物架及叠放托盘，紧邻安检通道。"],
  ["gates","闸机导向立柱","轻量导向构件，为检票区保留清晰的通行空间。"],
  ["connections","楼扶梯安全提示","入口侧的安全提示构件，配合上方方向标识。"],
  ["platform","候车座椅","磨石条板、靠背、金属支脚与扶手，位于候车空间内侧。"],
  ["commercial","售水与充电组合","玻璃售货柜、瓶装商品、取货口和充电立柱。"],
  ["maintenance","设备房与消防组合","双扇设备门、门把手、通风百叶与玻璃消防箱。"],
];
const categories: Record<string,string> = { architecture:"建筑模块",facility:"进站设施",wayfinding:"导向标识",barrier:"栏杆与围护" };
export const EXHIBITS: Exhibit[] = [
  ...([ ["suite","出发休息室样板","墙面立体品牌、座椅、边几、入口门与侧向通道组成的简洁准备空间。"], ["room","休息室建筑","暖白墙、灰绿护墙及大块地面，展厅采用开顶剖视。"], ["seat","休息室双人座椅","圆角坐垫、独立靠背及落地支脚。"], ["table","边几与杯子","低边几与带杯把的中空陶瓷杯。"], ["brand","03轻快立体字标","与界面SVG同源的字形，约2厘米挤出并保留孔洞。"], ["console","世界创建控制台","旧版控制台资产，保留独立查看；当前休息室已撤下。"], ["wardrobe","角色储物柜","旧版储物柜资产，保留独立查看；选角已改为界面入口。"], ["door","控制室滑动门","两扇独立滑动门板，启程时打开。"], ["passage","控制室连接通道","从准备室侧向接入公共入口上端平台。"] ] as const).map(([ref,label,description])=>({id:`control-${ref}`,label,description,category:"控制室",kind:"control" as const,ref})),
  {id:"metro-head",label:"青绿线 · 头车",category:"列车",kind:"train",ref:"head",description:"保持原始米制比例，包含驾驶室、独立车门、转向架、座椅与吊环。"},
  {id:"metro-trailer",label:"青绿线 · 中间车",category:"列车",kind:"train",ref:"trailer",description:"与头车连接的中间车厢，带车间贯通、空调及受电弓细节。"},
  {id:"stairs",label:"石材下行楼梯",category:"楼层连接",kind:"stairs",ref:"stairs",description:"12米水平距离、6米落差，36级踏步，双道防滑条及玻璃金属护栏。"},
  {id:"escalator",label:"玻璃金属扶梯",category:"楼层连接",kind:"escalator",ref:"escalator",description:"槽面踏步、梳齿板、金属裙板和闭合的橡胶扶手。"},
  {id:"entrance-passage",label:"通往地面的入口通道",category:"楼层连接",kind:"entrance",ref:"entrance",description:"24级台阶下降4米，包含墙裙、盲道、扶手及照明；地面街景不在展示范围内。"},
  ...details.map(([family,label,description])=>({id:`detail-${family}`,label,description,family,kind:"detail" as const,ref:family,category:"运营与生活"})),
  ...ASSETS.map(a=>({...a,kind:"kit" as const,ref:a.id,category:categories[a.category]??a.category})),
  ...METRO_RAILING_ASSETS.map(a=>({id:a.id,label:a.label,category:"栏杆与围护",kind:"kit" as const,ref:a.id,description:a.style==="glass"?"透明面板与独立金属立柱，可按空间跨度拼接。":"圆管扶手与固定立柱，按实际通行边界收口。"})),
];
export const SURFACES: {id:SurfaceName;label:string;description:string}[] = [
  {id:"stone",label:"暖白磨石",description:"用于楼梯踏面、站台和服务台面。"},{id:"sage",label:"灰绿磨石",description:"站厅地面与细部饰面，保留柔和的颗粒感。"},
  {id:"wall",label:"暖白墙面",description:"柔和墙面颗粒，连接柱网、入口和设备用房。"},{id:"steel",label:"拉丝金属",description:"栏杆、台面及设备边框的细密金属纹理。"},
  {id:"concrete",label:"建筑混凝土",description:"楼梯底板、结构与轨道基础表面。"},{id:"dark",label:"深色轨道基础",description:"轨道和设备的深色背景与支承。"},
  {id:"rubber",label:"防滑橡胶",description:"楼梯防滑条、车门密封和扶梯扶手。"},{id:"tactile",label:"黄色盲道",description:"按0.3米模数平铺的凸点及边缝。"},
  {id:"paint",label:"暖白设备涂装",description:"列车与服务设备的细颗粒涂装。"},{id:"jade",label:"青绿涂装",description:"青绿线列车和公共服务设施的主色。"},
  {id:"red",label:"消防砖红",description:"消防箱与安全设施的识别色。"},{id:"ribbed",label:"扶梯金属槽面",description:"按行进方向排列的细槽面与金属粗糙度。"},
  {id:"glass",label:"浅绿玻璃",description:"透明护栏与服务设施的玻璃面板。"},{id:"light",label:"暖色灯面",description:"灯条、设备照明与列车灯面。"},{id:"screen",label:"信息屏幕",description:"公共设施和设备的信息显示面。"},
];
export const ROOM_VIEWS = [
  {id:"overview",label:"双层剖视",subtitle:"站厅、楼层连接与站台",number:"01"},
  {id:"hall",label:"进站站厅",subtitle:"售票 · 安检 · 检票",number:"02"},
  {id:"entrance",label:"入口通道",subtitle:"从上端楼梯进入车站",number:"03"},
  {id:"connections",label:"楼梯与扶梯",subtitle:"真实楼板开口与下行连接",number:"04"},
  {id:"platform",label:"站台与列车",subtitle:"岛式候车区 · 青绿编组",number:"05"},
  {id:"services",label:"服务与生活",subtitle:"问询 · 便民 · 等候",number:"06"},
] as const;
export type RoomView = typeof ROOM_VIEWS[number]["id"];
