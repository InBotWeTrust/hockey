import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NovicePushPrompt } from './NovicePushPrompt.js';
import { fetchNovicePushPrompt,fetchPushConfig,recordNovicePushPrompt,savePushSubscription,updatePushPreferences } from '../api/push.js';
vi.mock('../api/push.js',()=>({fetchNovicePushPrompt:vi.fn(),fetchPushConfig:vi.fn(),recordNovicePushPrompt:vi.fn(),savePushSubscription:vi.fn(),updatePushPreferences:vi.fn()}));
const requestPermission=vi.fn();
const subscribe=vi.fn();
function setup(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><NovicePushPrompt userId="player"/></QueryClientProvider>);}
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubGlobal('Notification',{permission:'default',requestPermission});
 vi.stubGlobal('PushManager',class {});
 vi.stubGlobal('matchMedia',()=>({matches:false}));
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe}})}});
 subscribe.mockResolvedValue({toJSON:()=>({endpoint:'https://example.com/push',keys:{p256dh:'key',auth:'auth'}})});
 requestPermission.mockResolvedValue('granted');
 vi.mocked(fetchNovicePushPrompt).mockResolvedValue({eligible:true});
 vi.mocked(fetchPushConfig).mockResolvedValue({supported:true,publicKey:'AQAB'});
 vi.mocked(recordNovicePushPrompt).mockResolvedValue({ok:true});
 vi.mocked(savePushSubscription).mockResolvedValue({ok:true});
 vi.mocked(updatePushPreferences).mockResolvedValue({dailyGame:true} as never);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('requests permission only on a voluntary click and uses the existing subscription endpoint',async()=>{
 setup();
 const button=await screen.findByRole('button',{name:'Включить напоминания'});
 expect(requestPermission).not.toHaveBeenCalled();
 fireEvent.click(button);
 await screen.findByText('Напоминания включены');
 expect(requestPermission).toHaveBeenCalledTimes(1);
 expect(savePushSubscription).toHaveBeenCalledTimes(1);
 expect(updatePushPreferences).toHaveBeenCalledWith({dailyGame:true});
 expect(recordNovicePushPrompt).toHaveBeenCalledWith('handled');
});
it('snoozes without requesting system permission',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'Не сейчас'}));
 await waitFor(()=>expect(screen.queryByText('Напомнить о следующем периоде?')).not.toBeInTheDocument());
 expect(recordNovicePushPrompt).toHaveBeenCalledWith('snooze');
 expect(requestPermission).not.toHaveBeenCalled();
});
it.each(['denied','granted'])('does not propose permission again when already %s',async permission=>{
 vi.stubGlobal('Notification',{permission,requestPermission});setup();
 expect(screen.queryByRole('button',{name:'Включить напоминания'})).not.toBeInTheDocument();
 expect(requestPermission).not.toHaveBeenCalled();
});
it('keeps a snoozed player free of the proposal',async()=>{
 vi.mocked(fetchNovicePushPrompt).mockResolvedValue({eligible:false});setup();
 await waitFor(()=>expect(fetchNovicePushPrompt).toHaveBeenCalled());
 expect(screen.queryByRole('button',{name:'Включить напоминания'})).not.toBeInTheDocument();
});
it('explains installation on iPhone without prompting for permission',async()=>{
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('iPhone Safari');
 setup();fireEvent.click(await screen.findByRole('button',{name:'Как включить'}));
 expect(screen.getByText(/на экран «Домой»/)).toBeInTheDocument();
 expect(requestPermission).not.toHaveBeenCalled();
});
