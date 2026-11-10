import {paintRoadDepth} from './road-depth.mjs';
import {resizeMotionSurface} from './motion-resolution.mjs?v=1';
import {caretakerPlacement} from './caretaker-preview.mjs?v=2';
import {createIncident,stepIncident,incidentFrame,incidentActors,vehicleAspect,trafficAllowed} from './rear-end-preview.mjs?v=2';
export function previewYard(state){return state.items.find(item=>item.asset==='boxes-20261108-rink'&&!item.hidden)||state.items.find(item=>item.asset==='courtyard-combined-v5'&&!item.hidden);}
import { signalPhase, createVehicles, stepVehicles, laneBaselines, vehiclePaintOrder, vehicleWheelAnchor } from './traffic-variety-4aa4e0c869a3.mjs';
import { projectRegion } from './environment-state.mjs';
import { environmentPhase } from './environment-state.mjs';


export function mountCityMotion({ world, getState, image }) {
  const enabled={traffic:true,accident:false,plane:true,grigory:false};
  const signal={value:'auto'}, directionSelect={value:'auto'},signalStatus={textContent:''};
  let paused=false,disposed=false,animationFrame;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.width = 3000;
  canvas.height = 1000;
  canvas.className = 'city-studio-motion';
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  canvas.style.zIndex = '3';
  canvas.setAttribute('aria-label', 'Движение машин, самолёта и заливка льда');
  world.append(canvas);
  const context = canvas.getContext('2d');
  const loaded = new Map();
  let elapsed = 0;
  let incident = createIncident();
  let vehicles = createVehicles();
  let previous = 0;
  let lastPaint = 0;

  function source(id) {
    const asset = getState().assets.find(entry => entry.id === 'extra-' + id || entry.id === id);
    if (!asset) return;
    if (!loaded.has(asset.src)) {
      loaded.set(asset.src, null);
      void image(asset.src).then(value => { loaded.set(asset.src, value); draw(); }).catch(() => {});
    }
    return loaded.get(asset.src);
  }

  function sprite(id, x, y, width, mirror = false) {
    const im = source(id);
    if (!im) return;
    context.save();
    context.translate(x * 30, y * 10);
    if (mirror) { context.translate(width * 30, 0); context.scale(-1, 1); }
    context.filter = environmentPhase(getState().environment) === 'night' ? 'brightness(.72)' : 'none';
    context.drawImage(im, 0, 0, width * 30, width * 30 * im.naturalHeight / im.naturalWidth);
    context.restore();
  }

  function paintVehicle(actor) {
    const im = source(actor.id);
    if (!im) return;
    const asset = getState().assets.find(entry => entry.id === 'extra-' + actor.id);
    const [left, top, right, bottom] = asset.bbox;
    const height = actor.width * 30 * vehicleAspect(actor.id,getState().assets);
    context.save();
    context.translate(actor.x * 30, actor.baseline * 10 - height * vehicleWheelAnchor(actor.id));
    if (actor.mirror) { context.translate(actor.width * 30, 0); context.scale(-1, 1); }
    context.filter = environmentPhase(getState().environment) === 'night' ? 'brightness(.72)' : 'none';
    context.drawImage(im, left, top, right - left, bottom - top, 0, 0, actor.width * 30, height);
    context.restore();
    if (['night','sunset'].includes(environmentPhase(getState().environment))) {
      const x=(actor.x+(actor.mirror?0:actor.width))*30,y=actor.baseline*10-height*.3;
      context.save();context.translate(x,y);if(actor.mirror)context.scale(-1,1);
      const beam=context.createLinearGradient(0,0,55,0);beam.addColorStop(0,'#fff3bf50');beam.addColorStop(1,'#fff3bf00');
      context.fillStyle=beam;context.beginPath();context.moveTo(0,-2);context.lineTo(55,-9);context.lineTo(55,9);context.lineTo(0,2);context.fill();context.restore();
    }
    if (actor.id === 'accident-police') {
      context.fillStyle = Math.floor(elapsed * 7) % 2 ? '#3888ff' : '#ff4040';
      context.fillRect((actor.x + 1.6) * 30, actor.baseline * 10 - height * .75, 8, 3);
    }
  }

  let surfaceDirty = true;
  let surfaceDensity = 0;
  const surfaceObserver = new ResizeObserver(() => { surfaceDirty = true; draw(); });
  surfaceObserver.observe(world);
  const onResize=()=>{surfaceDirty=true;};
  window.addEventListener('resize',onResize);

  function draw() {
    if(disposed)return;
    const density = window.devicePixelRatio || 1;
    if (surfaceDirty || surfaceDensity !== density) {
      const bounds = world.getBoundingClientRect();
      resizeMotionSurface(canvas, context, bounds.width, bounds.height, density);
      surfaceDirty = false;
      surfaceDensity = density;
    }
    canvas.dataset.motionTime = elapsed.toFixed(3);
    const frame=incidentFrame(incident);
    canvas.dataset.accidentPhase=frame.phase;
    canvas.dataset.incident=JSON.stringify(frame);
    context.clearRect(0, 0, 3000, 1000);
    const phase = signal.value === 'auto' ? signalPhase(elapsed) : signal.value;
    canvas.dataset.signal = phase;
    canvas.dataset.vehicles = JSON.stringify(vehicles.map(({ lane, x }) => ({ lane, x: +x.toFixed(3) })));
    signalStatus.textContent = { green: ' 🟢', yellow: ' 🟡', red: ' 🔴' }[phase];
    const actors = [];
    if (enabled.traffic) {
      for (const car of vehicles) {
        // Keep ordinary traffic out of the incident lane while the scenario runs.
        if (enabled.accident && !trafficAllowed(car,frame)) continue;
        actors.push({ id: 'traffic-' + car.model, x: car.x, baseline: laneBaselines[car.lane], width: car.width, mirror: car.direction < 0 });
      }
    }
    if(enabled.accident)actors.push(...incidentActors(frame,laneBaselines));
    canvas.dataset.actors=JSON.stringify(actors);
    paintRoadDepth(front=>paintSignals(phase,front),()=>{
      for (const actor of vehiclePaintOrder(actors)) paintVehicle(actor);
    });
    if (enabled.plane && (enabled.preview || elapsed % 600 > 480)) sprite('plane', (elapsed * 4 + 20) % 120 - 10, 5, 2.8 / 1.5);
    const yard = previewYard(getState());
    if (enabled.grigory && yard) {
      const placement=caretakerPlacement(yard),im=source('grigory-flood');
      canvas.dataset.caretaker=JSON.stringify(placement);
      if(im){
        const p=placement,c=p.crop;context.save();
        context.translate(p.x+p.width,p.y);context.scale(-1,1);
        context.filter=environmentPhase(getState().environment)==='night'?'brightness(.72)':'none';
        context.drawImage(im,c.x,c.y,c.w,c.h,0,0,p.width,p.height);context.restore();
      }
      const {start,end}=placement.spray;
      context.fillStyle = '#e4f5ff';
      for (let index = 0; index < 12; index++) {
        const t = (elapsed * 1.8 + index / 12) % 1;
        context.globalAlpha = (1 - t) * .65;
        context.beginPath();
        context.arc(start.x+(end.x-start.x)*t,start.y+(end.y-start.y)*t,.7+t,0,Math.PI*2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }
  function paintSignals(phase, front) {
    const state = getState();
    for (const item of state.items.filter(item => !item.hidden && item.asset.includes('-signal-') && item.asset.endsWith('signal-left') === front)) {
      const asset = state.assets.find(asset => asset.id === item.asset);
      const im = source(item.asset);
      if (!asset || !im) continue;
      const [x, y, right, bottom] = asset.bbox;
      context.drawImage(im, x, y, right - x, bottom - y, item.x * 30, item.y * 10, item.w * 30, item.h * 10);
      // The reverse face has no visible lenses.
      if (!item.asset.endsWith('signal-left')) continue;
      const lensY = { red: 235, yellow: 378, green: 525 }[phase];
      const [[cx, cy], [rx, ry]] = projectRegion(item, asset, [[375 / 1024, lensY / 1536], [408 / 1024, (lensY + 39) / 1536]]);
      context.save();
      context.fillStyle = { red: '#ff493b', yellow: '#ffcf43', green: '#56e780' }[phase];
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 4;
      context.beginPath();
      context.ellipse(cx, cy, Math.abs(rx - cx), Math.abs(ry - cy), -.15, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function tick(now) {
    const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now;
    if (!document.hidden && !paused && !motion.matches) {
      elapsed += delta;
      const phase = signal.value === 'auto' ? signalPhase(elapsed) : signal.value;
      if (enabled.traffic) vehicles = stepVehicles(vehicles, delta, phase);
      if(enabled.accident){if(incident.phase==='idle'&&directionSelect.value!=='auto')incident={...incident,direction:Number(directionSelect.value)};incident=stepIncident(incident,delta,phase);}
      if(enabled.accident){const f=incidentFrame(incident);vehicles=vehicles.map(car=>trafficAllowed(car,f)?car:{...car,x:car.direction>0?-12-(car.id%5)*24:112+(car.id%5)*24});}
    }
    if (!document.hidden && now - lastPaint > 33) { draw(); lastPaint = now; }
    if(!disposed)animationFrame=requestAnimationFrame(tick);
  }
  animationFrame=requestAnimationFrame(tick);
  return {update(options){Object.assign(enabled,options);draw();},dispose(){disposed=true;cancelAnimationFrame(animationFrame);surfaceObserver.disconnect();window.removeEventListener('resize',onResize);canvas.remove();}};
}
