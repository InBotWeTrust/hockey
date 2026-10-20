import {render} from '@testing-library/react';
import {expect,it} from 'vitest';
import {BarInteriorBackdrop} from './BarInteriorBackdrop.js';

it('keeps Maria and Grigory on one uninterrupted wall image in every lighting phase',()=>{
 for(const phase of ['day','morning','sunset','night'] as const){
  const view=render(<BarInteriorBackdrop phase={phase} previous={null}/>);
  expect(view.container.querySelector('[data-bar-wall="hall"] img')).not.toBeNull();
  expect(view.container.querySelector('[data-bar-wall="middle"]')).toBeNull();
  expect(view.container.querySelector('[data-bar-wall="east"]')).toBeNull();
  view.unmount();
 }
});
