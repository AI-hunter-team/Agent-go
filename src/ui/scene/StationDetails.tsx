import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { WorldDefinition } from '../../shared/world';
import type { GeneratedPalette } from './generatedSurfaces';
import type { StationKit } from './stationAssets';
import type { GameSession } from '../gameSession';
import { stationDetailScene } from './stationDetailScene';
export function StationDetails({definition,palette,kit,session,overview}:{definition:WorldDefinition;palette:GeneratedPalette;kit?:StationKit;session:GameSession;overview:boolean}){
 const scene=useMemo(()=>stationDetailScene(definition,palette,kit),[definition,palette,kit]);
 useEffect(()=>scene.dispose,[scene]);
 useFrame(()=>{const floor=session.engine.player.pos.floorId;scene.upper.visible=overview||!(floor==='platform'||floor?.startsWith('transit'));});
 return <primitive object={scene.root} dispose={null}/>;
}
