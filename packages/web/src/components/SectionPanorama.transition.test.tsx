import type * as MotionReact from 'motion/react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('motion/react', async (original) => ({
  ...await original<typeof MotionReact>(),
  animate: vi.fn(() => ({ stop: vi.fn() })),
  useReducedMotion: () => false,
}));
import { animate } from 'motion/react';
import { SectionPanorama } from './SectionPanorama.js';
it('changes pages without injecting a drag recoil into content and scenery', () => {
  const props = {label:'Банк',pages:[{id:'bank',label:'Банк',image:'/b.webp'},{id:'history',label:'История',image:'/h.webp'}],onSelect:vi.fn(),panorama:'/bank.webp',storageKey:'transition'};
  const view = render(<SectionPanorama {...props} selected="bank"><p>Банк</p></SectionPanorama>);
  vi.mocked(animate).mockClear();
  view.rerender(<SectionPanorama {...props} selected="history"><p>История</p></SectionPanorama>);
  expect(animate).not.toHaveBeenCalled();
});
