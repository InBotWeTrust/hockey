import type {CaretakerEquipment} from './caretakerEquipment.js';
import {blizzardWind, BLIZZARD_STORM_TICKS, type BlizzardState, type CaretakerVariant} from '@hockey/game-core';
export type CaretakerVenue='yard'|'stadium';
export function caretakerPresentation(variant:CaretakerVariant,venue:CaretakerVenue,equipment:CaretakerEquipment=venue==='stadium'?'machine':'shovel'){
 const ventilation=variant==='blizzard'&&venue==='stadium';
 return {
  ventilation,
  title:variant==='drift'?'Лёд в заносе':ventilation?'Сквозняк на арене':'Григорий против метели',
  copy:variant==='drift'
   ? equipment==='machine'?'Веди пальцем, чтобы управлять машиной. Убери всю ледяную крошку, чтобы сократить перерыв. Машину заносит, а после удара о борт Григорию нужна секунда, чтобы прийти в себя.':'Веди пальцем, чтобы управлять Григорием. Убери весь снег, чтобы сократить перерыв.'
   : ventilation
    ? `На арене включили продувку! Собирай ${equipment==='machine'?'машиной':'скребком'} ледяную крошку и сгоняй её к борту. Большая куча замедляет движение, а сильный поток воздуха может сорвать часть груза.`
    : 'Ветер гоняет снег по льду! Перехватывай снежные полосы скребком и сгоняй весь снег к борту. Большая куча замедляет движение, а сильный боковой порыв может сорвать часть снега.',
  completed:variant==='blizzard'&&!ventilation?'Метель побеждена!':'Лёд готов!',
  directionLabel:ventilation?'Направление продувки':'Направление ветра',
 };
}
export function blizzardWeatherLabel(state:BlizzardState,venue:CaretakerVenue){
 const wind=blizzardWind(state),indoor=venue==='stadium';
 const cargo=state.flakes.filter(f=>f.status===2).length;
 const heading=wind.warning?(indoor?'Смена потока':'Смена ветра')
  :wind.strength===0?(state.ticks<60?(indoor?'Включают продувку':'Подуло')
   :state.ticks<BLIZZARD_STORM_TICKS?(indoor?'Пауза продувки':'Затишье'):(indoor?'Продувка завершена':'Ветер стих'))
  :indoor?['Включили продувку','Прибавили мощность','Кто так настроил?'][wind.wave-1]
   :['Подуло','Разгулялось','Ну и погодка!'][wind.wave-1];
 const x=wind.warning?wind.nextX:wind.x,y=wind.warning?wind.nextY:wind.y;
 const arrow=Math.abs(y)>.35?(x>0?(y>0?'↘':'↗'):(y>0?'↙':'↖')):(x>0?'→':x<0?'←':'·');
 return `${arrow} ${state.spillUntil>state.ticks?'Сдуло часть кучи!':heading} · ${wind.wave}/3${cargo?` · ${cargo>=24?'Тяжело':'К борту'}: ${cargo}`:''}`;
}
