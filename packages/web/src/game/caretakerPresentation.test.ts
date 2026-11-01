import {expect,it} from 'vitest';
import {createBlizzard} from '@hockey/game-core';
import {caretakerPresentation,blizzardWeatherLabel} from './caretakerPresentation.js';
it('keeps the outdoor blizzard and gives the indoor game a ventilation story',()=>{
 const outdoor=caretakerPresentation('blizzard','yard');
 const indoor=caretakerPresentation('blizzard','stadium');
 expect(outdoor.title).toBe('Григорий против метели');
 expect(indoor.title).toBe('Сквозняк на арене');
 expect(indoor.copy).toContain('ледяную крошку');
 expect(indoor.copy).not.toMatch(/Метель|Ветер гоняет/);
 expect(indoor.ventilation).toBe(true);
 expect(caretakerPresentation('drift','stadium').title).toBe('Лёд в заносе');
});
it('describes the same gust schedule as ventilation without modifying the state',()=>{
 const initial=createBlizzard('same-physics'),before=structuredClone(initial);
 for(const [ticks,text] of [[100,'Включили продувку'],[1000,'Прибавили мощность'],[2000,'Кто так настроил?'],[858,'Смена потока'],[840,'Пауза продувки'],[3240,'Продувка завершена']] as const){
  expect(blizzardWeatherLabel({...initial,ticks},'stadium')).toContain(text);
 }
 expect(initial).toEqual(before);
 expect(blizzardWeatherLabel({...initial,ticks:2000},'yard')).toContain('Ну и погодка!');
});
