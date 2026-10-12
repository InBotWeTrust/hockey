export const characterEmotions=['neutral','joy','interest','surprise','empathy','displeasure'] as const;
export type CharacterEmotion=typeof characterEmotions[number];
export function safeEmotion(value:unknown):CharacterEmotion {
 return typeof value==='string' && characterEmotions.includes(value as CharacterEmotion) ? value as CharacterEmotion : 'neutral';
}
