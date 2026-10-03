import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CyberpunkEffects} from './CyberpunkEffects';
it('shows the active strip and an accessible three-tap panel, without shooting',()=>{
 const tap=vi.fn();
 render(<CyberpunkEffects scene={{activeStrip:{id:'strip-1',kind:'strip',strip:1,startMs:0,endMs:6000},warningStrip:null,remainingTaps:3,outage:false,outageWarning:false}} layer="panel" onTap={tap} busy={false}/>);
 fireEvent.click(screen.getByRole('button',{name:/Отключить полосу/})); expect(tap).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('button').querySelector('img')).toHaveAttribute('src','/bonus-games/effects/cyberpunk-breaker.png');
});
it('keeps the panel disabled while the server checks a tap',()=>{
 render(<CyberpunkEffects scene={{activeStrip:{id:'strip-1',kind:'strip',strip:1,startMs:0,endMs:6000},warningStrip:null,remainingTaps:1,outage:false,outageWarning:false}} layer="panel" busy={true}/>);
 expect(screen.getByRole('button')).toBeDisabled();
});
it('projects the strip as a tapered surface instead of a UI rectangle',()=>{
 const {container}=render(<CyberpunkEffects scene={{activeStrip:{id:'strip-1',kind:'strip',strip:0,startMs:0,endMs:6000},warningStrip:null,remainingTaps:3,outage:false,outageWarning:false}} layer="ice"/>);
 expect(container.querySelector('rect')).toBeNull();
 const points=container.querySelector('polygon')!.getAttribute('points')!.split(' ').map(p=>p.split(',').map(Number));
 expect(points[1]![0]!-points[0]![0]!).toBeLessThan(points[2]![0]!-points[3]![0]!);
 expect((points[1]![0]!+points[0]![0]!)/2).not.toBe((points[2]![0]!+points[3]![0]!)/2);
});

it('slides in during warning, then leaves when the strip vanishes',()=>{
 const warning={id:'strip-2',kind:'strip' as const,strip:2,startMs:0,endMs:4000};
 const scene={activeStrip:null,warningStrip:warning,remainingTaps:3,outage:false,outageWarning:false};
 const {container,rerender}=render(<CyberpunkEffects scene={scene} layer="panel"/>);
 expect(container.querySelector('.cyberpunk-panel')).toHaveClass('cyberpunk-panel--visible');
 expect(screen.getByRole('button')).toBeDisabled();
 rerender(<CyberpunkEffects scene={{...scene,warningStrip:null}} layer="panel"/>);
 expect(container.querySelector('.cyberpunk-panel')).not.toHaveClass('cyberpunk-panel--visible');
 expect(container.querySelector('button')).toBeDisabled();
});
