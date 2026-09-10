import { describe, expect, it } from 'vitest';
import { Goal } from './Goal.js';

describe('animated rink renderers', () => {
  it('renders the goal flash without a realtime blur filter', () => {
    const goal = new Goal();
    const light = goal.container.children[0];

    expect(light?.filters).toBeUndefined();
  });
});
