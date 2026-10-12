import type {BarCharacter,ConversationSnapshot} from './conversationApi.js';
export const emotions=['neutral','joy','interest','surprise','empathy','displeasure'] as const;
export type CharacterEmotion=typeof emotions[number];
export type CharacterExpression=CharacterEmotion|'greeting';
const supported=['maria','daria','grigory','arsenich','veronika','oleg','igor'];
export function safeEmotion(value:unknown):CharacterEmotion {
 return typeof value==='string'&&emotions.includes(value as CharacterEmotion)?value as CharacterEmotion:'neutral';
}
export function emotionAsset(character:string,emotion:unknown):string|null {
 return supported.includes(character)?`/bar/emotions/${character}/${emotion==='greeting'?'greeting':safeEmotion(emotion)}-v1.webp`:null;
}
export function emotionFromSnapshot(data:ConversationSnapshot):CharacterEmotion {
 const last=data.turns.at(-1);
 if(data.interventionActive||last?.intervention==='intervention'||last?.intervention==='fight')return 'displeasure';
 if(last?.intervention==='apology'||last?.intervention==='calm')return 'neutral';
 return safeEmotion(last?.emotion);
}
export function canGreet(data:ConversationSnapshot):boolean {
 if(data.interventionActive||data.pending)return false;
 const last=data.turns.at(-1),emotion=emotionFromSnapshot(data);
 const elapsed=last?Date.now()-Date.parse(last.createdAt):Infinity;
 return !(['empathy','displeasure'].includes(emotion)&&(!Number.isFinite(elapsed)||elapsed<6*60*60*1000));
}
export function preloadEmotions(character:BarCharacter){
 for(const emotion of emotions){const path=emotionAsset(character,emotion);if(path){const image=new Image();image.src=path;}}
}

export function prepareGreeting(character:BarCharacter):Promise<boolean>{
 const path=emotionAsset(character,'joy');
 if(!path)return Promise.resolve(false);
 return new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=path;});
}

export function entryEmotion(data:ConversationSnapshot):CharacterEmotion{
 if(data.interventionActive)return 'displeasure';
 const last=data.turns.at(-1),emotion=emotionFromSnapshot(data);
 const elapsed=last?Date.now()-Date.parse(last.createdAt):Infinity;
 return ['empathy','displeasure'].includes(emotion)&&(!Number.isFinite(elapsed)||elapsed<6*60*60*1000)?emotion:'neutral';
}
