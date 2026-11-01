import {createDrift,stepDrift,DRIFT_VERSION,DRIFT_TARGET,type DriftState,type DriftControl} from './drift.js';
import {createBlizzard,stepBlizzard,isBlizzard,BLIZZARD_VERSION,BLIZZARD_TARGET} from './blizzard.js';
export type CaretakerVariant='drift'|'blizzard';
export const createCaretakerGame=(seed:string,variant:CaretakerVariant):DriftState=>variant==='blizzard'?createBlizzard(seed):createDrift(seed);
export const stepCaretakerGame=(state:DriftState,input:DriftControl):DriftState=>isBlizzard(state)?stepBlizzard(state,input):stepDrift(state,input);
export const caretakerGameTarget=(state:DriftState)=>isBlizzard(state)?BLIZZARD_TARGET:DRIFT_TARGET;
export const caretakerGameVersion=(variant:CaretakerVariant)=>variant==='blizzard'?BLIZZARD_VERSION:DRIFT_VERSION;
export const caretakerGameVariant=(state:DriftState):CaretakerVariant=>isBlizzard(state)?'blizzard':'drift';
