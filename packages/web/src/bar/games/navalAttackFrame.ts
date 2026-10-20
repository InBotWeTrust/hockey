import { barBattleship as sea } from '@hockey/game-core';
export const NAVAL_BOMB_STEP_MS = 250;
export const NAVAL_ATTACK_SCENE_MS = 1600;
/** Present a staggered attack without modifying authoritative results. */
export function navalAttackFrame(game: sea.View, before: sea.View | undefined, elapsed: number, viewer: 0 | 1 = game.player ?? 0): sea.View {
  const action=game.lastAction;
  if(!before||action?.type!=='attack'||action.cells.length<2||elapsed>=NAVAL_ATTACK_SCENE_MS)return game;
  const count=Math.min(action.cells.length,Math.max(0,Math.floor(elapsed/NAVAL_BOMB_STEP_MS)+1));
  const pending=new Set(action.cells.slice(count).map(m=>m.cell));
  if(!pending.size)return game;
  const ownAttacked=action.player!==viewer;
  const oldMarks=before.shots[action.player];
  const marks=[...oldMarks];
  for(const mark of action.cells.slice(0,count)) {
    const i=marks.findIndex(m=>m.cell===mark.cell);
    if(i<0)marks.push(mark);else marks[i]=mark;
  }
  const shots=[...game.shots] as sea.View['shots'];shots[action.player]=marks;
  return {...game,shots,
    ownShips:!ownAttacked?game.ownShips:game.ownShips.map(s=>({...s,hits:s.hits.filter(c=>!pending.has(c)||!!before?.ownShips.find(old=>old.id===s.id)?.hits.includes(c))})),
    enemySunk:ownAttacked?game.enemySunk:game.enemySunk.filter(s=>before?.enemySunk.some(old=>old.id===s.id)||!sea.cells(s).some(c=>pending.has(c))),
  };
}
