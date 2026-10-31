import { ATTRACTIONS } from "../../sim/layout";
import { box, cylinder, materials, sphere, type colors } from "./resources";
import { Sign } from "./Sign";

function Part({ at, size, color = "chalk" }: { at: [number, number, number]; size: [number, number, number]; color?: keyof typeof colors }) {
  return <mesh position={at} scale={size} geometry={box} material={materials[color]} castShadow receiveShadow />;
}

function ToyMachine() {
  return <group>
    <Part at={[0, 1.35, 0]} size={[2.8, 2.7, 1.6]} color="brick" />
    <Part at={[0, 1.45, .84]} size={[2.45, 1.65, .04]} color="ink" />
    {[-.75, 0, .75].flatMap((x, col) => [1.05, 1.85].map((y, row) => <group key={`${col}-${row}`} position={[x, y, .96]}>
      <mesh geometry={sphere} material={materials[(col + row) % 2 ? "ochre" : "chalk"]} scale={[.2, .23, .16]} />
      <mesh geometry={sphere} material={materials[(col + row) % 2 ? "chalk" : "sage"]} position={[0, -.27, 0]} scale={[.17, .2, .15]} />
      {[-1, 1].map(side => <mesh key={side} geometry={sphere} material={materials.chalk} position={[side * .13, .2, 0]} scale={[.075, .16, .06]} />)}
      {[-1, 1].map(side => <mesh key={side} geometry={sphere} material={materials.ink} position={[side * .065, .02, .16]} scale={[.024, .035, .018]} />)}
    </group>))}
    <Part at={[0, 1.42, 1]} size={[2.5, .055, .46]} color="white" />
    <Part at={[0, .42, .85]} size={[1.15, .22, .08]} color="ink" />
    <Part at={[1.1, .52, .87]} size={[.17, .22, .05]} color="screen" />
    <Sign text="POP MART" position={[0, 2.48, .86]} width={2.5} facing="south" dark={false} />
  </group>;
}

function Advert() {
  return <group>
    <Part at={[0, 1.55, 0]} size={[2.9, 3.1, .55]} color="ink" />
    <Part at={[0, 1.55, .3]} size={[2.65, 2.75, .04]} color="sage" />
    <mesh geometry={sphere} material={materials.ochre} position={[-.5, 1.85, .37]} scale={[.72, .72, .06]} />
    <Part at={[.5, 1.35, .42]} size={[.7, 1.2, .04]} color="chalk" />
    <Part at={[0, .12, 0]} size={[3, .24, .8]} color="grey" />
    <Sign text="城市漫游  CITY WALKS" position={[0, 2.68, .35]} width={2.6} facing="south" />
    <Sign text="下一站，遇见好风景" position={[0, .55, .36]} width={2.3} facing="south" dark={false} />
  </group>;
}

function FlowerStall() {
  return <group>
    <Part at={[0, .75, 0]} size={[2.9, .18, 1.4]} color="ochre" />
    {[-1.1, 1.1].map(x => <Part key={x} at={[x, .35, 0]} size={[.12, .7, 1.1]} color="ink" />)}
    {[-1, -.33, .33, 1].map((x, i) => <group key={x} position={[x, .95, -.1]}>
      <mesh geometry={cylinder} material={materials.grey} scale={[.22, .38, .22]} />
      {[-.12, .1].map((offset, j) => <group key={offset} position={[offset, .33 + j * .12, 0]}>
        <mesh geometry={cylinder} material={materials.sage} scale={[.025, .55, .025]} />
        <mesh geometry={sphere} material={materials[i % 2 ? "brick" : "ochre"]} position={[0, .29, 0]} scale={[.18, .16, .18]} />
        <mesh geometry={sphere} material={materials.chalk} position={[.08, .31, -.07]} scale={[.1, .12, .12]} />
      </group>)}
    </group>)}
    <Sign text="今日鲜花  FLOWERS" position={[0, .62, -.75]} width={2.6} facing="north" />
  </group>;
}

export function CommercialFeatures() {
  return <group>
    {ATTRACTIONS.map(a => <group key={a.id} position={[a.pos.x, 0, a.pos.y]}>
      {a.kind === "toys" && <ToyMachine />}
      {a.kind === "advert" && <Advert />}
      {a.kind === "flowers" && <FlowerStall />}
      {a.kind === "seating" && <>
        <Part at={[0, .55, 0]} size={[3, .18, 1.1]} color="sage" />
        <Part at={[0, 1.05, .45]} size={[3, .85, .14]} color="sage" />
        {[-1.1, 1.1].map(x => <Part key={x} at={[x, .24, 0]} size={[.16, .48, .8]} color="ink" />)}
      </>}
      {a.kind === "information" && <>
        <Part at={[0, 3.25, -2]} size={[.07, .8, .07]} color="ink" />
        <Part at={[0, 3.25, 2]} size={[.07, .8, .07]} color="ink" />
        <Sign text="前方验票  →  北楼梯 / 南扶梯" position={[0, 2.8, 0]} width={5.5} />
      </>}
    </group>)}
  </group>;
}
