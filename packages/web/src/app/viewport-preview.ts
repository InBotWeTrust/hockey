import './global.css';
import './design-system.css';
import { installAppViewport } from './viewport.js';

// Local simulation only: no authentication or application requests.
const visual = Object.assign(new EventTarget(), { height: innerHeight - 60, offsetTop: 0, scale: 1 });
Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
document.documentElement.style.setProperty('--app-safe-top', '47px');
document.documentElement.style.setProperty('--app-dock-safe-bottom', '10px');
document.getElementById('root')!.innerHTML = `
<div class="app-shell" style="max-width:430px;margin:auto;width:100%;height:var(--app-viewport-height,100dvh);min-height:var(--app-viewport-height,100dvh);position:relative;top:var(--app-viewport-top,0px);transform:translateZ(0);overflow:hidden">
  <div class="app-content"><main class="screen" style="position:relative;height:var(--app-viewport-height,100dvh);min-height:0;overflow:hidden">
    <header class="chat-edge-top chat-edge-top--overlay"><h1 style="font-size:18px;margin:0 14px">Симуляция iPhone</h1><p class="preview-explanation" style="margin:8px 14px">Без аккаунта и сетевых запросов. Проверка высоты и смещения окна, а не реальная клавиатура.</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin:12px"><button id="closed">Без клавиатуры</button><button id="keyboard">Клавиатура</button><button id="pan">Смещение</button><button id="resume">Возврат</button></div></header>
    <div id="messages" style="overflow:auto;flex:1;min-height:0;margin-top:190px;margin-bottom:100px;padding:0 16px">${Array.from({ length: 30 }, (_, i) => `<p>Тестовое сообщение ${i + 1}</p>`).join('')}</div>
    <div class="chat-edge-bottom chat-edge-bottom--overlay" style="padding-inline:12px"><textarea aria-label="Сообщение" style="display:block;width:100%;height:56px;font-size:16px;border-radius:18px;padding:12px" placeholder="Сообщение…"></textarea></div>
  </main></div>
</div><div id="keyboard-area" style="display:none;position:fixed;left:0;right:0;bottom:0;background:#08182b;color:white;padding:24px;text-align:center;z-index:100">Область клавиатуры (симуляция)</div>`;
installAppViewport();
const change = (height: number, offsetTop: number, event: 'resize' | 'scroll' | 'pageshow'): void => {
  visual.height = height; visual.offsetTop = offsetTop;
  const keyboard = document.getElementById('keyboard-area')!;
  keyboard.style.display = innerHeight - height > 120 ? 'block' : 'none';
  keyboard.style.top = `${height + offsetTop}px`;
  (event === 'pageshow' ? window : visual).dispatchEvent(new Event(event));
};
document.getElementById('closed')!.onclick = () => change(innerHeight - 60, 0, 'resize');
document.getElementById('keyboard')!.onclick = () => change(Math.max(240, innerHeight - 400), 0, 'resize');
document.getElementById('pan')!.onclick = () => change(Math.max(240, innerHeight - 400), 100, 'scroll');
document.getElementById('resume')!.onclick = () => change(innerHeight - 60, 0, 'pageshow');
