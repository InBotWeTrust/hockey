import { expect, it } from 'vitest';
import { gameArt, gameCharacters, characterNames } from './content.js';
import { computerOpponents } from '../cards/computerOpponents.js';
it('offers Maria for cards and Daria for darts with her own scene set', () => {
  expect(computerOpponents.map((o) => o.id)).toEqual(['maria']);
  expect(gameCharacters.darts).toBe('daria');
  expect(characterNames.daria).toBe('Дарья');
  for (const scene of ['invite', 'character-win', 'character-loss'])
    expect(gameArt('darts', scene, 'daria')).toBe(`/bar/games/darts-daria-${scene}-v1.webp`);
  expect(gameArt('darts', 'character-win', 'maria')).toBe('/bar/games/darts-character-win-v2.webp');
  expect(gameArt('darts', 'online-win')).toBe('/bar/games/darts-online-win-v2.webp');
});
it('uses Timofey only for character results, with a neutral naval scene online',()=>{
 expect(gameCharacters.battleship).toBe('timofey');
 expect(gameArt('battleship','character-win','timofey')).toBe('/bar/games/battleship-character-win-v1.webp');
 expect(gameArt('battleship','online-win')).toBe('/bar/games/battleship-online-result-v1.webp');
});
