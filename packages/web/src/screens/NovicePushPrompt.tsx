import {trackNovice,useFunnelObservation} from '../analytics/noviceFunnel.js';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNovicePushPrompt, fetchPushConfig, recordNovicePushPrompt, savePushSubscription, updatePushPreferences } from '../api/push.js';
import { getTelegramMiniApp } from '../auth/telegramMiniApp.js';
import { isNativeAndroid } from '../platform/runtime.js';
import { nativePush } from '../platform/push.js';
import { supportsPushNotifications, getReadyServiceWorkerRegistration, normalizePushSubscription, urlBase64ToArrayBuffer } from '../platform/webPush.js';

export function NovicePushPrompt({userId}:{userId:string}) {
  const native = isNativeAndroid();
  const telegram = getTelegramMiniApp() !== null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone === true;
  const install = ios && !standalone;
  const supported = supportsPushNotifications();
  const [initialPermission] = useState(() => typeof Notification === 'undefined' ? 'default' : Notification.permission);
  const [hidden,setHidden] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [instructions,setInstructions] = useState(false);
  const pending = useRef(false);
  const eligibleEnvironment = !telegram && (native || install || supported) && (native || initialPermission === 'default');
  const prompt = useQuery({queryKey:['push','novice-prompt',userId],queryFn:fetchNovicePushPrompt,enabled:eligibleEnvironment && Boolean(userId),retry:false,refetchOnMount:'always',refetchOnWindowFocus:false});
  const config = useQuery({queryKey:['push','config'],queryFn:fetchPushConfig,enabled:eligibleEnvironment && !native,retry:false});
  const nativeStatus = useQuery({queryKey:['push','native-prompt-permission',userId],queryFn:()=>nativePush.getStatus(),enabled:native && eligibleEnvironment,retry:false});
  const available = native ? nativeStatus.data?.permission === 'prompt' || nativeStatus.data?.permission === 'prompt-with-rationale' : config.data?.supported && Boolean(config.data.publicKey);
  useFunnelObservation('push_prompt_shown',!hidden && eligibleEnvironment && prompt.data?.eligible===true && !prompt.isFetching && Boolean(available));
  if (hidden || !eligibleEnvironment || !prompt.data?.eligible || prompt.isFetching || !available) return null;

  async function snooze() {
    if(pending.current)return;
    pending.current=true;setBusy(true);
    try { await recordNovicePushPrompt('snooze');trackNovice('push_permission_outcome','snoozed');setHidden(true); }
    catch {setMessage('Не удалось сохранить выбор. Попробуй ещё раз.');}
    finally {pending.current=false;setBusy(false);}
  }
  async function enable() {
    if(pending.current)return;
    if(install){trackNovice('push_permission_outcome','install_instructions');setInstructions(true);return;}
    pending.current=true;setBusy(true);setMessage('');
    try {
      // Permission is requested directly in the click handler, preserving user activation.
      const permission = native ? (await nativePush.subscribe()).status : await Notification.requestPermission();
      trackNovice('push_permission_outcome',permission==='granted'?'granted':permission==='denied'?'denied':'default');
      await recordNovicePushPrompt('handled');
      if(permission !== 'granted') {
        setInstructions(true);
        setMessage('Разрешение не выдано. Включить уведомления можно в настройках устройства и профиля.');
        return;
      }
      if(!native) {
        const registration = await getReadyServiceWorkerRegistration();
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing ?? await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToArrayBuffer(config.data!.publicKey!)});
        await savePushSubscription(normalizePushSubscription(subscription));
      }
      await updatePushPreferences({dailyGame:true});
      setInstructions(true);setMessage('Напоминания включены');
    } catch {trackNovice('push_permission_outcome','error');setInstructions(true);setMessage('Не удалось включить напоминания. Попробуй в настройках профиля.');}
    finally {pending.current=false;setBusy(false);}
  }
  return <div className="novice-push-prompt">
    <p>{message || 'Напомнить о следующем периоде?'}</p>
    {instructions && install && <p>Открой игру в Safari. В меню «Поделиться» выбери пункт добавления на экран «Домой». Запусти её с новой иконки и включи уведомления в настройках профиля.</p>}
    {!instructions && <div className="novice-push-prompt__actions">
      <button type="button" disabled={busy} onClick={()=>void enable()}>{install?'Как включить':'Включить напоминания'}</button>
      <button type="button" disabled={busy} onClick={()=>void snooze()}>Не сейчас</button>
    </div>}
    {instructions && install && <button type="button" disabled={busy} onClick={()=>void snooze()}>Не сейчас</button>}
  </div>;
}
