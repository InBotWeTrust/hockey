import type { FightHeldInput } from '@hockey/game-core';
import { LegacyFightView,type FightViewProps as LegacyProps } from './LegacyFightView.js';
import { ResponsiveFightView } from './ResponsiveFightView.js';
export interface FightViewProps extends LegacyProps {
 onInput?: (input:FightHeldInput)=>void|boolean;
 onAttack?: ()=>void|boolean|string;
}
export function FightView(props:FightViewProps):JSX.Element {
 return props.state.rules.version>=3 ? <ResponsiveFightView {...props}/> : <LegacyFightView {...props}/>;
}
