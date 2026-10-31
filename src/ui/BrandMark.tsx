import type { BrandTone } from "../assets/brand";
export function BrandMark({icon=false,tone="color",className}:{icon?:boolean;tone?:BrandTone;className?:string}){
 return <img className={className} src={`/assets/brand/${icon?"icon":"wordmark"}-${tone}.svg`} alt="agent-go" width={icon?64:200} height={icon?50:57} draggable={false}/>;
}
