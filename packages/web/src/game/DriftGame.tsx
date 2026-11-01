import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  createCaretakerGame,
  caretakerGameVersion,
  caretakerGameTarget,
  isBlizzard,
  stepCaretakerGame,
  driftProgress,
  DRIFT_DT,
  type DriftControl,
} from '@hockey/game-core';
import { sendDrift, type DriftSession } from '../api/drift.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import './drift.css';
import {animateMachineImpact} from './machineImpact.js';
import { MachineWaterTrail } from './machineWaterTrail.js';
import { drawBlizzard } from './blizzardVisuals.js';
import {STADIUM_MACHINE_SPRITES,drawStadiumMachine,stadiumMachineFrame} from './stadiumMachine.js';
import {caretakerPresentation,blizzardWeatherLabel} from './caretakerPresentation.js';
import { driftCaretakerWidth } from './driftCaretakerSize.js';
import { SCRAPE_SPRITE_WIDTH } from './renderer/IceCar.js';
import { LogOut } from 'lucide-react';
const stopped: DriftControl = { x: 0, y: 0, held: false };
export function DriftGame({
  initial,
  onExit,
  onComplete,
  send = sendDrift,
  venue = "yard",
}: {
  initial: DriftSession;
  onExit: () => void;
  onComplete: () => void;
  send?: typeof sendDrift;
  venue?: "yard" | "stadium";
}) {
  const variant=initial.variant??'drift';
  const engineVersion=caretakerGameVersion(variant);
  const presentation=caretakerPresentation(variant,venue);
  const {title,copy}=presentation;
  const [weather,setWeather]=useState(`${presentation.ventilation?'Включают продувку':'Подуло'} · 1/3`);
  const [startingPhysics]=useState(()=>createCaretakerGame(initial.seed,variant));
  const canvas = useRef<HTMLCanvasElement>(null),
    physics = useRef(startingPhysics),
    control = useRef<DriftControl>(stopped);
  const queue = useRef<DriftControl[]>([]),
    flight = useRef(false),
    retry = useRef<{ seq: number; controls: DriftControl[] } | null>(null),
    seq = useRef(initial.seq),
    mounted = useRef(false),
    confirmed = useRef(initial.completed),
    failed = useRef(false);
  const [percent, setPercent] = useState(0),
    [instruction, setInstruction] = useState(initial.showInstruction),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [seconds, setSeconds] = useState(
      Math.max(0, Math.ceil((Date.parse(initial.readyAt) - Date.parse(initial.serverNow)) / 1000)),
    );
  const paused = useRef(instruction);
  paused.current = instruction || initial.version !== engineVersion;
  const ready = useRef({
    at: Date.parse(initial.readyAt),
    server: Date.parse(initial.serverNow),
    received: Date.now(),
  });
  const origin = useRef<{ x: number; y: number } | null>(null),
    stick = useRef<{ x: number; y: number } | null>(null),
    exit = useRef(onExit),
    complete = useRef(onComplete);
  exit.current = onExit;
  complete.current = onComplete;
  const sender = useRef(send);
  sender.current = send;
  const release = () => {
    control.current = stopped;
    origin.current = null;
    stick.current = null;
  };
  async function flush() {
    if (flight.current || confirmed.current || (!queue.current.length && !retry.current)) return;
    flight.current = true;
    const batch = retry.current ?? { seq: seq.current + 1, controls: queue.current.slice(0, 30) };
    retry.current = batch;
    try {
      const result = await sender.current(initial.attemptId, batch.seq, batch.controls);
      if (!mounted.current) return;
      queue.current.splice(0, batch.controls.length);
      seq.current = batch.seq;
      retry.current = null;
      failed.current = false;
      setError('');
      ready.current = {
        at: Date.parse(result.readyAt),
        server: Date.parse(result.serverNow),
        received: Date.now(),
      };
      if (result.completed) {
        confirmed.current = true;
        release();
        setDone(true);
        complete.current();
      }
    } catch (e) {
      if (mounted.current) {
        failed.current = true;
        release();
        setError(e instanceof Error ? e.message : 'Не удалось подтвердить уборку.');
      }
    } finally {
      flight.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    let frame = 0,
      last = performance.now(),
      acc = 0,
      completionAt = 0;
    const machineImages=Object.fromEntries(Object.entries(STADIUM_MACHINE_SPRITES).map(([key,src])=>{
      const img=new Image();img.src=src;return [key,img];
    })) as Record<keyof typeof STADIUM_MACHINE_SPRITES,HTMLImageElement>;
    const waterTrail=new MachineWaterTrail();
    const image = new Image();
    image.src = '/sprites/rink-caretaker-scrape.webp';
    const downImage = new Image();
    downImage.src = '/sprites/rink-caretaker-scrape-down.webp';
    const rightImage = new Image();
    rightImage.src = '/caretaker/grigory-right-fresh-v1.png';
    const leftImage = new Image();
    leftImage.src = '/caretaker/grigory-left-fresh-v1.png';
    const seatedImage = new Image();
    seatedImage.src = '/caretaker/grigory-seated-fresh-v1.png';
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    let impactAnimation:Animation|null=null;
    let impactAt = -1000,
      impactX = 0,
      impactY = 0;
    const dust: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];
    const visibility = () => {
      release();
      last = performance.now();
      acc = 0;
    };
    document.addEventListener('visibilitychange', visibility);
    const draw = (time: number) => {
      if (ready.current.at <= ready.current.server + Date.now() - ready.current.received) {
        release();
        exit.current();
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (time - last) / 1000));
      last = time;
      if (
        !document.hidden &&
        !paused.current &&
        !failed.current &&
        !confirmed.current &&
        queue.current.length < 180 &&
        driftProgress(physics.current) < caretakerGameTarget(physics.current)
      ) {
        acc += dt;
        while (acc >= DRIFT_DT) {
          acc -= DRIFT_DT;
          const previous = physics.current,
            input = { ...control.current };
          physics.current = stepCaretakerGame(previous, input);
          queue.current.push(input);
          const machineCrash=venue==='stadium'&&variant==='drift'&&previous.fallTicks===0&&physics.current.fallTicks>0;
          if(machineCrash){
            impactAnimation?.cancel();
            impactAnimation=animateMachineImpact(canvas.current?.closest<HTMLElement>('[data-caretaker-surface]')??null,
              previous,physics.current,{venue,variant,reducedMotion});
          }
          if (physics.current.collision > previous.collision && time - impactAt > 180) {
            impactAt = time;
            const p = physics.current;
            impactX = p.x < 150 ? 8 : p.x > 450 ? 592 : p.x;
            impactY = p.y < 180 ? 12 : p.y > 620 ? 788 : p.y;
            const chips=machineCrash?24:12;
            for (let n = 0; n < chips; n++)
              dust.push({
                x: impactX,
                y: impactY,
                vx: Math.cos((n * Math.PI * 2) / chips) * (machineCrash?175:110),
                vy: Math.sin((n * Math.PI * 2) / chips) * (machineCrash?175:110),
                life: machineCrash?0.45:0.35,
              });
          }
          const updated=physics.current;
          if(isBlizzard(updated)&&updated.spilled>0){
            const startX=previous.x+Math.cos(previous.angle)*54;
            const startY=previous.y+Math.sin(previous.angle)*54;
            for(const flake of updated.flakes) if(flake.pickupAfter===updated.ticks+60){
              dust.push({x:startX,y:startY,vx:(flake.x-startX)/.5,vy:(flake.y-startY)/.5,life:.5});
            }
          }
          for (const fragment of physics.current.scatter) {
            const x = ((fragment.from % 48) + 0.5) * 12.5;
            const y = (Math.floor(fragment.from / 48) + 0.5) * 12.5;
            const toX = ((fragment.to % 48) + 0.5) * 12.5;
            const toY = (Math.floor(fragment.to / 48) + 0.5) * 12.5;
            for (let n = 0; n < 8; n++) dust.push({x,y,
              vx:(toX-x) / 0.55 + (n-3.5)*18,
              vy:(toY-y) / 0.55 - 35 + n*10,life:0.55});
          }
          if (physics.current.cleared > previous.cleared) {
            let count = 0;
            for (let i = 0; i < previous.snow.length && count < 20; i++)
              if (previous.snow[i] && !physics.current.snow[i]) {
                count++;
                dust.push({
                  x: ((i % 48) + 0.5) * 12.5,
                  y: (Math.floor(i / 48) + 0.5) * 12.5,
                  vx: Math.sin(i * 5.3) * 130,
                  vy: Math.cos(i * 3.2) * 110,
                  life: 0.5,
                });
              }
          }
          if (driftProgress(physics.current) >= caretakerGameTarget(physics.current)) break;
        }
      } else acc = 0;
      if (
        !failed.current &&
        (queue.current.length >= 30 || driftProgress(physics.current) >= caretakerGameTarget(physics.current))
      )
        void flush();
      const p = physics.current;
      if(isBlizzard(p))setWeather(blizzardWeatherLabel(p,venue));
      setPercent(Math.floor(driftProgress(p) * 100));
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (ready.current.at - (ready.current.server + Date.now() - ready.current.received)) /
              1000,
          ),
        ),
      );
      if (confirmed.current) {
        completionAt ||= time;
        p.vx *= 0.9;
        p.vy *= 0.9;
        if (time - completionAt > 1300) {
          exit.current();
          return;
        }
      }
      const el = canvas.current,
        ctx = el?.getContext('2d');
      if (el && ctx) {
        const rect = el.getBoundingClientRect(),
          dpr = Math.min(2, window.devicePixelRatio || 1);
        if (
          el.width !== Math.round(rect.width * dpr) ||
          el.height !== Math.round(rect.height * dpr)
        ) {
          el.width = Math.round(rect.width * dpr);
          el.height = Math.round(rect.height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        const sx = rect.width / 600,
          sy = rect.height / 800;
        if(venue==='stadium'){
          const scale=driftCaretakerWidth(rect.width,p.y)/SCRAPE_SPRITE_WIDTH*stadiumMachineFrame(p.angle).appearanceScale;
          if(!paused.current&&!confirmed.current&&p.fallTicks===0&&Math.hypot(p.vx,p.vy)>12){
            waterTrail.add(p.x*sx-Math.cos(p.angle)*103*scale,
              p.y*sy-Math.sin(p.angle)*103*scale,108*scale,time,p.angle);
          }
          waterTrail.draw(ctx,time);
        }
        ctx.scale(sx, sy);
        ctx.globalAlpha = confirmed.current ? Math.max(0, 1 - (time - completionAt) / 700) : 1;
        if(isBlizzard(p))drawBlizzard(ctx,p,time,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,venue==='stadium');
        for (let i = 0; i < p.snow.length; i++)
          if (p.snow[i]) {
            const x = ((i % 48) + 0.5) * 12.5,
              y = (Math.floor(i / 48) + 0.5) * 12.5;
            ctx.fillStyle = `rgba(250,253,255,${0.68 + (i % 5) * 0.05})`;
            ctx.beginPath();
            ctx.ellipse(x, y, p.snow[i] === 2 ? 6 : 10 + (i % 3), p.snow[i] === 2 ? 4 : 9, (i % 5) * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#b3d0e32b';
            ctx.fillRect(x - 3, y + 4, 4, 2);
          }
        ctx.globalAlpha = 1;
        for (let i = dust.length - 1; i >= 0; i--) {
          const flake = dust[i]!;
          flake.life -= dt;
          if (flake.life <= 0) {
            dust.splice(i, 1);
            continue;
          }
          flake.x += flake.vx * dt;
          flake.y += flake.vy * dt;
          ctx.fillStyle = `rgba(255,255,255,${flake.life * 1.6})`;
          ctx.beginPath();
          ctx.ellipse(flake.x, flake.y, 3.5, 2, flake.life * 8, 0, Math.PI * 2);
          ctx.fill();
        }
        const impactAge = (time - impactAt) / 1000;
        if (impactAge < 0.3) {
          ctx.strokeStyle = `rgba(255,255,255,${1 - impactAge / 0.3})`;
          ctx.lineWidth = 5 * (1 - impactAge / 0.3);
          ctx.beginPath();
          ctx.arc(impactX, impactY, 10 + impactAge * 100, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        // Keep the camera fixed: turn the body with directional sprites, not canvas rotation.
        const characterScale = driftCaretakerWidth(rect.width, p.y) / SCRAPE_SPRITE_WIDTH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(p.x * sx, p.y * sy);
        ctx.scale(characterScale, characterScale);
        if(venue==='stadium')drawStadiumMachine(ctx,machineImages,p.angle,p.fallTicks>0);
        else {
        const sideways = Math.abs(Math.cos(p.angle)) > 0.707;
        const right = Math.cos(p.angle) > 0;
        const poseImage = p.fallTicks > 0 ? seatedImage : right ? rightImage : leftImage;
        if ((p.fallTicks > 0 || sideways) && poseImage.complete && poseImage.naturalWidth) {
          const bodyHeight = SCRAPE_SPRITE_WIDTH * (1240 / 1024);
          if (p.fallTicks > 0) {
            // Match head scale to the standing sprites; never stretch seated poses to standing height.
            const pixelScale = bodyHeight / 940 * (180 / 210) * 0.85;
            const anchorX = 500;
            const anchorY = 560;
            ctx.drawImage(poseImage, -anchorX * pixelScale, -anchorY * pixelScale,
              poseImage.naturalWidth * pixelScale, poseImage.naturalHeight * pixelScale);
          } else {
            // Normalize by head-to-boot span, not the surrounding tool or transparent canvas.
            const bodySpan = right ? 940 : 965;
            const pixelScale = bodyHeight / bodySpan * 0.85;
            const anchor = right ? 550 : 1040;
            ctx.drawImage(poseImage, -anchor * pixelScale, -36 - (right ? 25 : 10) * pixelScale,
              poseImage.naturalWidth * pixelScale, poseImage.naturalHeight * pixelScale);
          }
        } else {
          const down = Math.sin(p.angle) > 0;
          const directionalImage = down ? downImage : image;
          // Both original sprites are 1024px wide but their bodies have different spans.
          const pixelScale = (SCRAPE_SPRITE_WIDTH * 1240 / 1024) / (down ? 1190 : 1240) * (down ? 0.9 : 1);
          if (directionalImage.complete && directionalImage.naturalWidth)
            ctx.drawImage(directionalImage, -512 * pixelScale, -36 - (down ? 60 : 225) * pixelScale,
              directionalImage.naturalWidth * pixelScale, directionalImage.naturalHeight * pixelScale);
        }
        }
        ctx.restore();
        if (origin.current && stick.current) {
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.strokeStyle = '#e9f8ff80';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(origin.current.x, origin.current.y, 25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(origin.current.x, origin.current.y);
          ctx.lineTo(stick.current.x, stick.current.y);
          ctx.stroke();
          ctx.restore();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      mounted.current = false;
      impactAnimation?.cancel();
      cancelAnimationFrame(frame);
      release();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [initial.attemptId,venue]);
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!origin.current) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    let dx = x - origin.current.x,
      dy = y - origin.current.y;
    const length = Math.hypot(dx, dy);
    if (length < 4) return;
    if (length > 65) {
      origin.current = { x: x - (dx / length) * 65, y: y - (dy / length) * 65 };
    }
    const size = Math.hypot(dx, dy) || 1;
    dx /= size;
    dy /= size;
    control.current = { x: dx, y: dy, held: true };
    stick.current = { x, y };
  };
  return (
    <section
      className="drift-game"
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="drift-hud">
        <button
          className="icon-btn"
          aria-label="Выйти"
          onClick={() => {
            release();
            onExit();
          }}
        >
          <LogOut size={18} />
        </button>
        <div className="drift-status initial-training-feedback-notice initial-training-feedback-notice--scoreboard">
          <b>{done ? presentation.completed : `Лед подготовлен: ${percent}%`}</b>
          <progress value={percent} max={100} aria-label="Очистка льда" />
          {variant==='blizzard'&&<small className="blizzard-wind" aria-label={presentation.directionLabel}>{weather}</small>}
        </div>
        <button
          className="icon-btn"
          aria-label="Правила игры"
          onClick={() => {
            release();
            setInstruction(true);
          }}
        >
          ?
        </button>
      </header>
      <canvas
        ref={canvas}
        className="drift-ice"
        aria-label="Управление Григорием"
        onPointerDown={(e) => {
          if (instruction || failed.current || confirmed.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          origin.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      />
      {instruction && (
        <AccessibleModal
          title={title}
          cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
          onRequestClose={() => setInstruction(false)}
        >
          <img className="bonus-game-preview-modal__artwork drift-briefing-art" src={venue === 'stadium' ? '/caretaker/machine-preview-v1.png' : '/caretaker/drift-yard-v2.png'} alt={venue==='yard'?'Григорий убирает снег на дворовом катке':'Григорий за рулём уборочной машины на любительском стадионе'}/>
          <p className="modal-copy bonus-game-preview-modal__story">
            {copy}
          </p>
          <div className="modal-actions">
            <button className="modal-primary btn btn--cta" onClick={() => setInstruction(false)}>
              Начать уборку
            </button>
          </div>
        </AccessibleModal>
      )}
      {(error || initial.version !== engineVersion) && (
        <div className="drift-instruction">
          <p role="alert">{error || 'Обнови игру, чтобы продолжить.'}</p>
          <button className="btn btn--cta" onClick={() => void flush()}>
            Повторить
          </button>
        </div>
      )}
      {seconds === 0 && !done && (
        <small className="drift-ready">Следующий период уже доступен</small>
      )}
    </section>
  );
}
