import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const mapCss=readFileSync('src/city/city-map.css','utf8');
const panelCss=readFileSync('src/city/city-game-panel.css','utf8');
afterEach(()=>document.querySelectorAll('[data-panel-position-test]').forEach(element=>element.remove()));
it('keeps the panel at the same top in either CSS loading order',()=>{
 const positions=[];
 for(const styles of [[mapCss,panelCss],[panelCss,mapCss]]){
  const sheets=styles.map(css=>{const node=document.createElement('style');node.dataset.panelPositionTest='';node.textContent=css;document.head.append(node);return node;});
  const anchor=document.createElement('div');anchor.className='district-game-anchor';anchor.dataset.panelPositionTest='';anchor.style.setProperty('--city-panel-y','51%');document.body.append(anchor);
  // jsdom cannot resolve custom properties in top; compare the real equal-specificity CSSOM cascade.
  const declarations=sheets.flatMap(sheet=>Array.from(sheet.sheet!.cssRules)).filter((rule):rule is CSSStyleRule=>'selectorText' in rule&&rule.selectorText==='.district-game-anchor').map(rule=>rule.style.getPropertyValue('top')).filter(Boolean);
  positions.push(declarations.at(-1));
  anchor.remove();sheets.forEach(sheet=>sheet.remove());
 }
 expect(positions[0]).toBeTruthy();
 expect(positions[1]).toBe(positions[0]);
});
