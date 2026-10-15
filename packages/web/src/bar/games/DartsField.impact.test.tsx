import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barDarts } from '@hockey/game-core';
import { DartsField } from './GameFields.js';
afterEach(cleanup);
it('shows contact feedback only after landing and clears it after impact', () => {
  const props = {
    game: barDarts.create(0),
    lastDart: { x: 0, y: -0.6 },
    animationStart: 1000,
    disabled: true,
    send: vi.fn(),
  };
  const { container, rerender } = render(<DartsField {...props} now={1600} />);
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
  rerender(<DartsField {...props} now={1750} />);
  expect(container.querySelector('.bar-dart-contact')).not.toBeNull();
  expect(container.querySelector('.bar-dartboard--impact')).not.toBeNull();
  rerender(<DartsField {...props} now={2100} />);
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
});
it('does not show a target impact on a miss', () => {
  const { container } = render(
    <DartsField
      game={barDarts.create(0)}
      lastDart={{ x: 0, y: -1.2 }}
      animationStart={1000}
      now={1750}
      disabled={true}
      send={vi.fn()}
    />,
  );
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
  expect(container.querySelector('.bar-dartboard--impact')).toBeNull();
});
it('clears the previous series after its last impact before the next player throws', () => {
 const hits=[{x:0,y:-0.6},{x:0.2,y:0.4},{x:-0.3,y:0.2}];
 const props={game:barDarts.create(1),dartHits:hits,lastDart:hits[2]!,animationStart:1000,disabled:true,send:vi.fn()};
 const {container,rerender}=render(<DartsField {...props} now={1750}/>);
 const embedded=()=>container.querySelectorAll('image[href="/bar/games/dart-embedded-v2.webp"]');
 expect(embedded()).toHaveLength(3);
 rerender(<DartsField {...props} now={2050}/>);
 expect(embedded()).toHaveLength(0);
});
it('retains darts within the same turn and clears them when that turn times out', () => {
 const hits=[{x:0,y:-0.6}];
 const props={game:{...barDarts.create(0),dartsLeft:2,hits},dartHits:hits,lastDart:hits[0]!,animationStart:1000,disabled:false,send:vi.fn()};
 const {container,rerender}=render(<DartsField {...props} now={4000}/>);
 const embedded=()=>container.querySelectorAll('image[href="/bar/games/dart-embedded-v2.webp"]');
 expect(embedded()).toHaveLength(1);
 rerender(<DartsField {...props} game={barDarts.timeout(props.game)} lastDart={null} now={41000}/>);
 expect(embedded()).toHaveLength(0);
});
