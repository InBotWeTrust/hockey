import { beforeEach, expect, it } from 'vitest';
import { captureGameReturn, consumeGameReturn } from './gameReturn.js';
import { toLocation } from './ColumnNavigation.js';
beforeEach(() => sessionStorage.clear());
it('restores the source detail once and isolates accounts', () => {
  const source = toLocation('/?view=amateur&section=tournaments&tournament=t1&tab=schedule');
  captureGameReturn('a', source);
  expect(consumeGameReturn('b')).toBeNull();
  expect(consumeGameReturn('a')).toEqual(source);
  expect(consumeGameReturn('a')).toBeNull();
});
it('rejects external, corrupt and active game destinations', () => {
  sessionStorage.setItem('game-return-v1:a', 'not json');
  expect(consumeGameReturn('a')).toBeNull();
  captureGameReturn('a', toLocation('/?view=daily'));
  expect(consumeGameReturn('a')).toBeNull();
  sessionStorage.setItem(
    'game-return-v1:a',
    JSON.stringify({ pathname: '//attacker.invalid', search: '', hash: '' }),
  );
  expect(consumeGameReturn('a')).toBeNull();
});
it('preserves the chosen training period across the isolated launch route', async () => {
  const { trainingPeriodFromSearch } = await import('./trainingPeriod.js');
  expect(trainingPeriodFromSearch('?period=2')).toBe(2);
  expect(trainingPeriodFromSearch('?period=3')).toBe(3);
  expect(trainingPeriodFromSearch('?period=0')).toBeNull();
});
