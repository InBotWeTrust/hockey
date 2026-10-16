import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {barDarts} from '@hockey/game-core';
import {DartsField} from './GameFields.js';
afterEach(cleanup);
it('turns numbers and scoring rings together after landing, then enables aiming',()=>{
 const props={game:{...barDarts.create(1),boardAngle:450},lastDart:null,engineVersion:9,disabled:false,send:vi.fn(),rotation:{from:0,to:450,start:1000,until:2200}};
 const {container,rerender}=render(<DartsField {...props} now={1000}/>);
 const rotor=container.querySelector('.bar-dartboard-rotor')!;
 expect(rotor).toHaveAttribute('transform','rotate(0 150 150)');
 expect(rotor.querySelectorAll('text')).toHaveLength(20);
 expect(screen.getByRole('button',{name:'Зажми дротик, наведи и отпусти'})).toHaveAttribute('aria-disabled','true');
 rerender(<DartsField {...props} now={1600}/>);
 expect(rotor).toHaveAttribute('transform','rotate(225 150 150)');
 rerender(<DartsField {...props} now={2200}/>);
 expect(rotor).toHaveAttribute('transform','rotate(450 150 150)');
 expect(screen.getByRole('button',{name:'Зажми дротик, наведи и отпусти'})).toHaveAttribute('aria-disabled','false');
});
