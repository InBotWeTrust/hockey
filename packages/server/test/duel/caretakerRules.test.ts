import {expect,it} from 'vitest';
import {acceleratedReadyAt,applyCaretakerInput,initialProgress} from '../../src/duel/daily/caretakerRules.js';
it('caps remaining break at two minutes and saves at least 45 seconds',()=>{
 for(const [remaining,expected] of [[900,120],[165,120],[135,90],[121,76],[120,0],[90,0],[0,0]]){
  const now=300000;
  expect(acceleratedReadyAt(0,now+remaining*1000,now)).toBe(now+expected*1000);
 }
 expect(acceleratedReadyAt(0,900000,950000)).toBe(900000);
});
it('requires correct alternating swipe directions and preserves progress on errors',()=>{let p=initialProgress();for(let i=0;i<4;i++)p=applyCaretakerInput('push',p,{x:0.5,y:0.8,toX:0.5,toY:0.2,ms:500},1000,1000);expect(p.value).toBe(4);expect(applyCaretakerInput('push',p,{x:0.5,y:0.8,toX:0.5,toY:0.2,ms:500},1000,1000).value).toBe(4);});
it('does not credit a hold beyond server elapsed time',()=>{expect(applyCaretakerInput('piles',initialProgress(),{x:.25,y:.25,toX:.25,toY:.25,ms:4000},250,250).value).toBe(250);});
it('rejects an early turn and accepts the edge window',()=>{const input={x:0,y:0,toX:0,toY:0,ms:0};expect(applyCaretakerInput('turn',initialProgress(),input,1000,1000).value).toBe(0);expect(applyCaretakerInput('turn',initialProgress(),input,4500,4500).value).toBe(1);});
it('cleans only adjacent trail segments inside the active lane',()=>{const p=initialProgress();expect(applyCaretakerInput('trail',p,{x:.25,y:.1,toX:.25,toY:.14,ms:500},500,500).value).toBe(1);expect(applyCaretakerInput('trail',p,{x:.25,y:.1,toX:.25,toY:.9,ms:500},500,500).value).toBe(0);});
it('requires the target direction and bounded power for snow throws',()=>{const p=initialProgress();expect(applyCaretakerInput('throw',p,{x:.5,y:.5,toX:.8,toY:.5,ms:500},4000,4000).value).toBe(1);expect(applyCaretakerInput('throw',p,{x:.5,y:.5,toX:.2,toY:.5,ms:500},4000,4000).value).toBe(0);});
it('ignores invalid inputs and rate limits correct swipes',()=>{expect(applyCaretakerInput('push',initialProgress(),{x:.5,y:.8,toX:.5,toY:.2,ms:100},100,100).value).toBe(0);expect(applyCaretakerInput('push',initialProgress(),{x:NaN,y:.8,toX:.5,toY:.2,ms:100},1000,1000).value).toBe(0);});
it('finishes all five variants through valid actions without extra rewards',()=>{
 for(const kind of ['push','trail','piles','turn','throw'] as const){let p=initialProgress();for(let n=0;n<100&&p.value<({push:20,trail:60,piles:24000,turn:5,throw:5}[kind]);n++){
 let input={x:.5,y:.8,toX:.5,toY:.2,ms:500};
 if(kind==='push'&&Math.floor(p.value/4)%2)input={...input,y:.2,toY:.8};
 if(kind==='trail'){const x=.25+Math.floor(p.value/20)*.25,y=.1+(p.value%20)*.04;input={x,y,toX:x,toY:y+.04,ms:500};}
 if(kind==='piles'){const index=Math.floor(p.value/4000),x=index%2===0?.25:.75,y=.25+Math.floor(index/2)*.25;input={x,y,toX:x,toY:y,ms:500};}
 if(kind==='throw')input={x:.5,y:.5,toX:p.value%2===0?.8:.2,toY:.5,ms:500};
 p=applyCaretakerInput(kind,p,input,4500+n*5000,5000);
 }expect(p.value).toBe({push:20,trail:60,piles:24000,turn:5,throw:5}[kind]);}
});
