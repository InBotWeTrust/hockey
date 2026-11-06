import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { expect, it, vi } from 'vitest';
import { gameInteractionProps } from './gameInteraction.js';

it('blocks browser menus and dragging without cancelling gameplay pointer events', () => {
  const pointer = vi.fn();
  const click = vi.fn();
  render(<main {...gameInteractionProps}>
    <button onClick={click} onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer}>Удар</button>
  </main>);
  const control = screen.getByRole('button', { name: 'Удар' });
  expect(fireEvent.contextMenu(control)).toBe(false);
  expect(fireEvent.dragStart(control)).toBe(false);
  expect(fireEvent.pointerDown(control)).toBe(true);
  expect(fireEvent.pointerMove(control)).toBe(true);
  expect(fireEvent.pointerUp(control)).toBe(true);
  fireEvent.click(control);
  expect(pointer).toHaveBeenCalledTimes(3);
  expect(click).toHaveBeenCalledOnce();
});

it('preserves editing menus in game forms and blocks menus in portalled descriptions', () => {
  render(<main {...gameInteractionProps}>
    <input aria-label="Ставка" defaultValue="20" />
    <div contentEditable suppressContentEditableWarning><span>Ввод текста</span></div>
    {createPortal(<p>Правила игры</p>, document.body)}
  </main>);
  expect(fireEvent.contextMenu(screen.getByRole('textbox', { name: 'Ставка' }))).toBe(true);
  expect(fireEvent.contextMenu(screen.getByText('Ввод текста'))).toBe(true);
  expect(fireEvent.contextMenu(screen.getByText('Правила игры'))).toBe(false);
});

it('disables Safari text selection and touch callouts only while a game is mounted', () => {
  const css = readFileSync('src/app/global.css', 'utf8');
  const start = css.indexOf('body:has([data-game-interaction]) * {');
  expect(start).toBeGreaterThan(-1);
  const rule = css.slice(start, css.indexOf('}', start));
  expect(rule).toContain('-webkit-user-select: none;');
  expect(rule).toContain('user-select: none;');
  expect(rule).toContain('-webkit-touch-callout: none;');
});
