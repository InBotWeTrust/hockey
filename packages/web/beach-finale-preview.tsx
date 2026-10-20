import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BonusResult } from './src/screens/BonusGamePlayScreen.js';
import type { BonusGameAttempt } from './src/api/bonusGames.js';
import fixture from './beach-finale-fixture.json';
import './src/app/global.css';
import './src/app/design-system.css';
function Preview() {
  const cyber = location.pathname.includes('cyberpunk-finale');
  const ski = location.pathname.includes('ski-finale');
  const [outcome,setOutcome]=useState<'completed'|'failed'|null>(new URLSearchParams(location.search).get('outcome') === 'failed' ? 'failed' : 'completed');
  const [run,setRun]=useState(0);
  return <main style={{padding:24,minHeight:'100dvh',background:'#8aa6bd'}}>
    <h1>{cyber ? 'Финалы киберпанка' : ski ? 'Финалы курорта' : 'Финалы пляжа'}</h1><p>Локальное превью на тестовых результатах.</p>
    <button className="btn btn--cta" onClick={()=>{setOutcome('completed');setRun(run+1)}}>Показать победу</button>{' '}
    <button className="btn btn--ghost" onClick={()=>{setOutcome('failed');setRun(run+1)}}>Показать поражение</button>
    {outcome && <BonusResult key={run} kind={outcome} attempt={{...fixture,rules:{...fixture.rules,slug:cyber?'challenge-cyberpunk-yard':ski?'challenge-ski-resort':'challenge-beach'},status:outcome,goals:outcome==='completed'?25:18,reward_granted:outcome==='completed' && new URLSearchParams(location.search).get('repeat') !== '1'} as BonusGameAttempt} onCatalog={()=>setOutcome(null)} onRetry={()=>setRun(run+1)} retrying={false}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
