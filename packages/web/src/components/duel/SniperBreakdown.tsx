import type { AmateurDuelParticipant } from '../../api/amateurDuel.js';
import { marksmanshipV6TechniqueLabel } from '../MarksmanshipScoreNotice.js';
import type { MarksmanshipV6Technique } from '@hockey/game-core';

const techniques = new Set(['ordinary','near_goalie','counter_direction','complex','precise','behind_goalie','corner','edge','super_precise']);
function categoryLabel(category:string):string {
  if (techniques.has(category)) return marksmanshipV6TechniqueLabel(category as MarksmanshipV6Technique);
  if (/^category_[1-4]$/.test(category)) return `Категория ${category.at(-1)}`;
  return ({open:'Открытое окно',timed:'Точный момент',narrow:'Узкое окно',unclassified:'Другие голы',board_side:'У борта'} as Record<string,string>)[category] ?? 'Другие голы';
}
export function SniperBreakdown({me,opponent}:{me:AmateurDuelParticipant;opponent:AmateurDuelParticipant}):JSX.Element {
  return <section aria-label="Категории бросков" style={{marginTop:12,display:'grid',gap:12}}>
    {([{player:me,label:'Вы',aria:'Броски: вы'},{player:opponent,label:'Соперник',aria:'Броски: соперник'}]).map(({player,label,aria})=><div key={aria}>
      <strong style={{fontSize:12}}>{label}</strong>
      <div role="list" aria-label={aria} style={{display:'grid',gap:6,marginTop:6,fontSize:12}}>
        {player.sniper_breakdown === undefined ? <span>Разбивка недоступна</span> : player.sniper_breakdown.length === 0 ? <span>Нет голов</span> : player.sniper_breakdown.map(row=><div role="listitem" key={`${row.category}:${row.points / row.count}`} style={{display:'flex',alignItems:'baseline',gap:5}}>
          <span>{categoryLabel(row.category)} {new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(row.points / row.count)}</span>
          <strong style={{whiteSpace:'nowrap'}}>×{row.count}</strong>
        </div>)}
      </div>
    </div>)}
  </section>;
}
