import type * as MotionReact from 'motion/react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('motion/react', async (original) => ({
  ...await original<typeof MotionReact>(),
  useReducedMotion: () => true,
}));
import { SectionPanorama } from './SectionPanorama.js';
it('settles the selected panorama directly with reduced motion enabled', async () => {
  const props={label:'Банк',pages:[{id:'bank',label:'Банк',image:'/b.webp'},{id:'history',label:'История',image:'/h.webp'}],onSelect:vi.fn(),panorama:'/bank.webp',storageKey:'reduced'};
  const view=render(<SectionPanorama {...props} selected="bank"><p>Банк</p></SectionPanorama>);
  view.rerender(<SectionPanorama {...props} selected="history"><p>История операций</p></SectionPanorama>);
  expect(screen.getByRole('tab',{name:'История'})).toHaveAttribute('aria-selected','true');
  await waitFor(()=>expect(view.container.querySelector('.section-scene__panorama')).toHaveStyle({transform:'translateX(calc(-50% + 0px))'}));
});
