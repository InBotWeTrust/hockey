import { afterEach, expect, it } from 'vitest';
import {
  clampChatSheetHeight,
  readChatSheetHeight,
  saveChatSheetHeight,
  withChatSheetHeight,
} from './chatSheetHeight.js';
afterEach(() => localStorage.clear());
it('limits the chosen height to a third through fullscreen', () => {
  expect(clampChatSheetHeight(0.1)).toBe(1 / 3);
  expect(clampChatSheetHeight(0.71)).toBe(0.71);
  expect(clampChatSheetHeight(3)).toBe(1);
});
it('remembers a custom height and the previous height when maximized, per account', () => {
  const custom = withChatSheetHeight(readChatSheetHeight('one'), 0.72);
  saveChatSheetHeight('one', custom);
  expect(readChatSheetHeight('one').height).toBe(0.72);
  saveChatSheetHeight('one', withChatSheetHeight(custom, 1));
  expect(readChatSheetHeight('one')).toEqual({ height: 1, compactHeight: 0.72 });
  expect(readChatSheetHeight('two').height).toBe(0.55);
});
it('ignores corrupt saved height without breaking chat', () => {
  localStorage.setItem('chat-sheet-height-v1:one', '{"height":"bad","compactHeight":null}');
  expect(readChatSheetHeight('one')).toEqual({ height: 0.55, compactHeight: 0.55 });
});
