import { expect, it } from 'vitest';
import { sniperBreakdown } from '../../../src/duel/amateur/sniperBreakdown.js';

it('keeps equal-score techniques separate and uses accepted points', () => {
  expect(sniperBreakdown([
    { technique:'complex', points:13 },
    { technique:'counter_direction', points:13 },
    { technique:'complex', points:13 },
  ])).toEqual([
    { category:'complex', count:2, points:2.6 },
    { category:'counter_direction', count:1, points:1.3 },
  ]);
});
it('does not invent a technique for legacy classifications', () => {
  expect(sniperBreakdown([{technique:null,points:10}])).toEqual([{category:'unclassified',count:1,points:1}]);
  expect(sniperBreakdown([])).toEqual([]);
});

it('keeps different accepted point values separate instead of showing an average', () => {
 expect(sniperBreakdown([{technique:'ordinary',points:10},{technique:'ordinary',points:20}])).toEqual([
  {category:'ordinary',count:1,points:1},{category:'ordinary',count:1,points:2},
 ]);
});
