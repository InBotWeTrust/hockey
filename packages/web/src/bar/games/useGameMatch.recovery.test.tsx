import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { ApiError } from '../../api/apiFetch.js';
import { gameApi } from './api.js';
import { useGameMatch } from './useGameMatch.js';
vi.mock('./api.js',()=>({gameApi:{read:vi.fn(),command:vi.fn()}}));
const view=():BarGameSnapshot=>({id:'m',kind:'billiards',player:0,character:null,participants:[],ready:null,serverNow:Date.now(),runtime:createMatch('billiards',0,Date.now(),false,1)});
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it('clears a polling failure after a successful refresh',async()=>{
 vi.useFakeTimers();vi.mocked(gameApi.read).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(view());
 const {result}=renderHook(()=>useGameMatch('m'));
 await act(async()=>{});expect(result.current.error).toContain('Не удалось обновить');
 await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
 expect(result.current.view).not.toBeNull();expect(result.current.error).toBeNull();
});
it('clears a revision conflict once the new field has been read',async()=>{
 vi.useFakeTimers();vi.mocked(gameApi.read).mockResolvedValue(view());
 vi.mocked(gameApi.command).mockRejectedValue(new ApiError(409,'conflict','Conflict'));
 const {result}=renderHook(()=>useGameMatch('m'));await act(async()=>{});
 await act(async()=>{result.current.send({type:'shot',angle:0,power:0.5});});
 expect(result.current.error).toBeNull();expect(result.current.uncertain).toBe(false);
});
it('retains an uncertain command and its retry even while polling succeeds',async()=>{
 vi.useFakeTimers();vi.mocked(gameApi.read).mockResolvedValue(view());vi.mocked(gameApi.command).mockRejectedValue(new Error('offline'));
 const {result}=renderHook(()=>useGameMatch('m'));await act(async()=>{});
 await act(async()=>{result.current.send({type:'shot',angle:0,power:0.5});});
 const first=vi.mocked(gameApi.command).mock.calls[0]![1];
 await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
 expect(result.current.uncertain).toBe(true);expect(result.current.error).toContain('Не удалось подтвердить');
 vi.mocked(gameApi.command).mockResolvedValue(view());
 await act(async()=>{result.current.retry();});
 expect(vi.mocked(gameApi.command).mock.calls[1]![1]).toEqual(first);
 expect(result.current.error).toBeNull();expect(result.current.uncertain).toBe(false);
});
