import type * as MotionReact from 'motion/react';
import { render, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const { start } = vi.hoisted(() => ({start: vi.fn()}));
vi.mock('motion/react', async (original) => {
  const motion = await original<typeof MotionReact>();
  return {...motion, useDragControls: () => {const controls=motion.useDragControls(); controls.start=start; return controls;}};
});
import { SectionPanorama } from './SectionPanorama.js';
it('waits for a deliberate horizontal gesture and ignores touch jitter and vertical scrolling', () => {
  const view=render(<SectionPanorama label="Банк" pages={[{id:'bank',label:'Банк',image:'/b.webp'}]} selected="bank" onSelect={()=>{}} panorama="/b.webp" storageKey="gesture"><p>Контент</p></SectionPanorama>);
  const page=view.container.querySelector('.section-scene__page')!;
  start.mockClear();
  fireEvent.pointerDown(page,{isPrimary:true,button:0,pointerId:1,clientX:100,clientY:100});
  fireEvent.pointerMove(page,{pointerId:1,clientX:103,clientY:102});
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerMove(page,{pointerId:1,clientX:104,clientY:125});
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerUp(page,{pointerId:1});
  fireEvent.pointerDown(page,{isPrimary:true,button:0,pointerId:2,clientX:100,clientY:100});
  fireEvent.pointerMove(page,{pointerId:2,clientX:125,clientY:102});
  expect(start).toHaveBeenCalledOnce();
});
it('leaves gestures inside the television to its episode scroller',()=>{
 const view=render(<SectionPanorama label="Квартира" pages={[{id:'story',label:'Сюжет',image:'/a.webp'}]} selected="story" onSelect={()=>{}} panorama="/a.webp" storageKey="tv"><div data-no-section-swipe><button>Серия</button></div></SectionPanorama>);
 start.mockClear();
 const episode=view.getByRole('button',{name:'Серия'});
 fireEvent.pointerDown(episode,{isPrimary:true,button:0,pointerId:3,clientX:100,clientY:100});
 fireEvent.pointerMove(episode,{pointerId:3,clientX:150,clientY:102});
 expect(start).not.toHaveBeenCalled();
});
