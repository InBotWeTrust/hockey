import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container } from 'pixi.js';
import type { Application, Ticker } from 'pixi.js';
import { ArrowLeft, ChevronRight, Home, Info, Play, Volume2, VolumeX } from 'lucide-react';
import {
  GOALIE_SIZE,
  GOALIE_Y,
  GOAL_OPENING,
  PUCK_START,
  RINK,
  SHOOTER_AMPLITUDE,
  SHOOTER_CENTER_X,
  STICK_NEUTRAL,
  deriveShotSeed,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  simulateGoal,
  simulateGoalie,
  type ShotResult,
} from '@hockey/game-core';
import { PixiStage } from '../game/PixiStage.js';
import { RinkSvg } from '../game/RinkSvg.js';
import { Goal } from '../game/renderer/Goal.js';
import { Goalie } from '../game/renderer/Goalie.js';
import { Hitboxes } from '../game/renderer/Hitboxes.js';
import { IceCar, iceCarPosAt } from '../game/renderer/IceCar.js';
import { Player } from '../game/renderer/Player.js';
import { Puck } from '../game/renderer/Puck.js';
import { createGameLoop, type GameLoop, type SpeedOverrides } from '../game/loop.js';
import type { Scale } from '../game/coords.js';
import { useAuthStore } from '../auth/authStore.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';
import { ScoreBoard } from '../components/ScoreBoard.js';
import { ResultModal } from '../components/ResultModal.js';
import type { DailyStateResponse, ShotInputPayload, ShotResultType } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';

const PAUSE_MS = 1000;
const SOUND_ENABLED_STORAGE_KEY = 'hockey:sound-enabled';
const MODE_ARTWORK_SIZE = 104;

type GameLevel = 'beginner' | 'amateur' | 'pro';
type BeginnerMode = 'daily' | 'training';
type DailyView = 'hub' | 'play';
type LevelArtwork = 'beginner' | 'amateur' | 'pro';
type ModeInfoModalContent = { title: string; text: string };

const MODE_ARTWORK_IMAGES: Record<LevelArtwork, string | null> = {
  beginner: '/modes/beginner.webp',
  amateur: '/modes/amateur.webp',
  pro: '/modes/pro.webp',
};

function speedOverridesForPeriod(periodNumber: number): SpeedOverrides {
  const preset = getDailyPeriodSpeedPreset(periodNumber);
  return {
    goalFreq: preset.goalFrequency,
    goalieFreq: preset.goalieFrequency,
    shooterFreq: preset.shooterFrequency,
    puckSpeed: preset.puckSpeedPerMs,
  };
}

function computeShooterX(t: number, freq: number): number {
  const period = 1000 / freq;
  const phase = (((t % period) + period) % period) / period;
  const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  return SHOOTER_CENTER_X + SHOOTER_AMPLITUDE * tri;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatSpeedValue(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function DailyScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useDailyStore((s) => s.data);
  const deferredState = useDailyStore((s) => s.deferredState);
  const error = useDailyStore((s) => s.error);
  const loading = useDailyStore((s) => s.loading);
  const refresh = useDailyStore((s) => s.refresh);
  const applyDeferredState = useDailyStore((s) => s.applyDeferredState);
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>('beginner');
  const [beginnerMode, setBeginnerMode] = useState<BeginnerMode>('daily');
  const [dailyView, setDailyView] = useState<DailyView>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'daily' ? 'play' : 'hub';
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'hub') {
      setDailyView('hub');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
    if (view === 'daily') {
      setDailyView('play');
      setSelectedLevel('beginner');
      setBeginnerMode('daily');
    }
  }, [location.search]);

  useEffect(() => {
    if (
      dailyView === 'play' &&
      data &&
      data.state !== 'period_active' &&
      data.state !== 'break_active'
    ) {
      setDailyView('hub');
      navigate('/?view=hub', { replace: true });
    }
  }, [dailyView, data, navigate]);

  void deferredState;
  void applyDeferredState;
  void userId;

  if (!data) {
    return (
      <main
        className="screen"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          padding: 20,
          textAlign: 'center',
        }}
      >
        {error ? (
          <>
            <div style={{ color: 'var(--red-deep, #b91c1c)', fontWeight: 600 }}>
              Не удалось загрузить
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 280 }}>{error}</div>
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Повторить
            </button>
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>
              Если ошибка повторяется — выйди и зайди заново через /login.
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)' }}>Загрузка…</div>
        )}
      </main>
    );
  }

  const openHub = (): void => {
    setDailyView('hub');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=hub', { replace: true });
  };

  const openDailyPlay = (): void => {
    setDailyView('play');
    setSelectedLevel('beginner');
    setBeginnerMode('daily');
    navigate('/?view=daily', { replace: true });
  };

  if (
    selectedLevel === 'beginner' &&
    beginnerMode === 'daily' &&
    dailyView === 'play' &&
    (data.state === 'period_active' || data.state === 'break_active')
  ) {
    return <DailyPlayView suppressedByModal={data.state === 'break_active'} onBack={openHub} />;
  }

  if (selectedLevel !== 'beginner') {
    return (
      <LevelPlaceholder
        level={selectedLevel}
        onBack={() => {
          setSelectedLevel('beginner');
          setBeginnerMode('daily');
        }}
      />
    );
  }

  if (beginnerMode === 'training') {
    return <TrainingPlaceholder onBack={openHub} />;
  }

  return (
    <GameHub
      onOpenDailyPlay={openDailyPlay}
      onOpenTraining={() => setBeginnerMode('training')}
      onOpenAmateurs={() => setSelectedLevel('amateur')}
    />
  );
}

function SegmentedControl({
  ariaLabel,
  items,
  value,
  onChange,
}: {
  ariaLabel: string;
  items: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.08)',
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            style={{
              minWidth: 0,
              minHeight: 34,
              borderRadius: 999,
              border: active ? '1px solid rgba(15, 23, 42, 0.92)' : '1px solid transparent',
              background: active ? 'rgba(15, 23, 42, 0.92)' : 'transparent',
              color: active ? '#ffffff' : 'var(--ink)',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              padding: '0 8px',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function GameHub({
  onOpenDailyPlay,
  onOpenTraining,
  onOpenAmateurs,
}: {
  onOpenDailyPlay: () => void;
  onOpenTraining: () => void;
  onOpenAmateurs: () => void;
}): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const startPeriod = useDailyStore((s) => s.startPeriod);
  const refresh = useDailyStore((s) => s.refresh);
  const trainingData = useTrainingSessionStore((s) => s.data);
  const [modeInfoModal, setModeInfoModal] = useState<ModeInfoModalContent | null>(null);
  const pending = useDailyStore((s) => s.inFlight);
  const nextPeriod = data.current_period === 0 ? 1 : data.current_period + 1;
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : 0;
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : 0;
  const nextDayAt = new Date(data.next_day_starts_at).getTime();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (
      data.state !== 'period_active' &&
      data.state !== 'break_active' &&
      data.state !== 'closed'
    ) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data.state]);

  const breakRemaining = Math.max(0, breakEndsAt - now);
  const periodRemaining = Math.max(0, periodEndsAt - now);
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  useEffect(() => {
    if (data.state === 'period_active' && periodEndsAt > 0 && periodRemaining === 0) void refresh();
    if (data.state === 'break_active' && breakEndsAt > 0 && breakRemaining === 0) void refresh();
    if (data.state === 'closed' && nextDayAt > 0 && nextDayRemaining === 0) void refresh();
  }, [
    data.state,
    periodEndsAt,
    periodRemaining,
    breakEndsAt,
    breakRemaining,
    nextDayAt,
    nextDayRemaining,
    refresh,
  ]);

  const canOpenDailySurface = data.state === 'period_active' || data.state === 'break_active';
  const canStartDailyPeriod = data.state === 'idle' && data.current_period < data.total_periods;
  const dailyActionDisabled = pending || (!canOpenDailySurface && !canStartDailyPeriod);
  const dailyActionLabel =
    data.state === 'period_active'
      ? `Вернуться в ${data.current_period}-й период`
      : data.state === 'break_active'
        ? `Смотреть перерыв ${formatMs(breakRemaining)}`
        : data.state === 'closed' || data.current_period >= data.total_periods
          ? 'День завершён'
          : `Начать ${nextPeriod}-й период`;
  const dailyEventTitle =
    data.state === 'period_active'
      ? `${data.current_period}-й период`
      : data.state === 'break_active'
        ? 'Перерыв'
        : data.state === 'closed'
          ? 'Ждём следующий день'
          : 'Игра доступна';
  const dailyEventSubtitle =
    data.state === 'period_active'
      ? `До конца периода ${formatMs(periodRemaining)} · ${data.current_period_shots}/${data.shots_per_period} бросков сыграно`
      : data.state === 'break_active'
        ? `До конца перерыва ${formatMs(breakRemaining)} · следующий: ${nextPeriod}-й период`
        : data.state === 'closed'
          ? `До обновления ${formatHms(nextDayRemaining)}`
          : `Можно начать ${nextPeriod}-й период`;
  const amateurGoals = Math.min(1000, data.lifetime_total_goals);
  const amateurProgress = Math.round((amateurGoals / 1000) * 100);
  const isAmateurUnlocked = amateurGoals >= 1000;
  const trainingShotsLimit = trainingData?.shots_limit ?? 500;
  const trainingShotsTaken = trainingData?.shots_taken ?? 0;
  const trainingAvailability = `${trainingShotsTaken}/${trainingShotsLimit} бросков сегодня`;

  const handleDailyAction = async (): Promise<void> => {
    if (canOpenDailySurface) {
      onOpenDailyPlay();
      return;
    }
    if (!canStartDailyPeriod) return;
    const next = await startPeriod();
    if (next?.state === 'period_active') onOpenDailyPlay();
  };

  const handleOpenAmateurs = (): void => {
    if (!isAmateurUnlocked) {
      setModeInfoModal({
        title: 'Не хватает шайб',
        text: 'Для открытия любительских игр необходимо забить 1000 шайб в ежедневных играх',
      });
      return;
    }
    onOpenAmateurs();
  };

  const handleOpenPro = (): void => {
    setModeInfoModal({
      title: 'Раздел в разработке',
      text: 'Следите за обновлениями игры. Как только режим будет готов, мы вам обязательно сообщим.',
    });
  };

  return (
    <main
      className="screen"
      style={{
        minHeight: '100dvh',
        padding: 'calc(16px + var(--app-safe-top)) 14px calc(92px + var(--app-safe-bottom))',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <section
          aria-label="События"
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="section-label"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              margin: '0 0 6px -14px',
            }}
          >
            <span>События</span>
            <button
              type="button"
              onClick={() =>
                setModeInfoModal({
                  title: 'Здесь будет описание страницы',
                  text: 'Здесь будут собраны все игровые события: ежедневная игра, дуэли, турниры и другие активности.',
                })
              }
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              aria-label="Об описании страницы"
            >
              <Info size={12} color="var(--muted)" />
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 28,
              padding: 18,
              minHeight: 206,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 18,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(226,238,249,0.74) 100%)',
              border: '1px solid rgba(255,255,255,0.82)',
              boxShadow: '0 18px 42px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <div
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div
                style={{
                  color: 'rgba(15, 23, 42, 0.58)',
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                Ежедневная игра
              </div>

              <div
                aria-label="Статус ежедневной игры"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 7,
                }}
              >
                <div
                  style={{
                    color: '#10192d',
                    fontSize: 26,
                    lineHeight: 1.05,
                    fontWeight: 900,
                  }}
                >
                  {dailyEventTitle}
                </div>
                <div
                  style={{
                    color: 'rgba(15, 23, 42, 0.58)',
                    fontSize: 14,
                    lineHeight: 1.28,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {dailyEventSubtitle}
                </div>
              </div>
            </div>

            <div
              style={{
                position: 'relative',
              }}
            >
              <button
                type="button"
                className="btn btn--cta"
                disabled={dailyActionDisabled}
                onClick={() => void handleDailyAction()}
                style={{
                  width: '100%',
                  minHeight: 62,
                  padding: '0 18px',
                  justifyContent: 'center',
                  letterSpacing: 0,
                  fontSize: 17,
                  boxShadow: dailyActionDisabled
                    ? 'none'
                    : '0 20px 34px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Play size={19} fill="currentColor" />
                  {dailyActionLabel}
                </span>
              </button>
            </div>
          </div>
        </section>

        <section
          aria-label="Разделы игры"
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="section-label" style={{ margin: '0 0 6px -14px' }}>
            Режимы
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <LevelHubCard
              title="Тренировка"
              description="Три периода на выбор"
              meta={trainingAvailability}
              artwork="beginner"
              tone="active"
              onClick={onOpenTraining}
            />

            <LevelHubCard
              title="Любители"
              description="Дуэли, турниры, инвентарь"
              meta={`${amateurGoals}/1000 шайб для открытия`}
              artwork="amateur"
              tone={isAmateurUnlocked ? 'default' : 'muted'}
              progress={amateurProgress}
              onClick={handleOpenAmateurs}
            />

            <LevelHubCard
              title="Профессионалы"
              description="Игры самого высокого уровня"
              meta="Раздел в разработке"
              artwork="pro"
              tone="muted"
              onClick={handleOpenPro}
            />
          </div>
        </section>
      </div>

      {modeInfoModal && (
        <ModeInfoModal
          title={modeInfoModal.title}
          text={modeInfoModal.text}
          onClose={() => setModeInfoModal(null)}
        />
      )}
    </main>
  );
}

function LevelHubCard({
  title,
  description,
  meta,
  artwork,
  tone = 'default',
  progress,
  onClick,
}: {
  title: string;
  description: string;
  meta: string;
  artwork: LevelArtwork;
  tone?: 'active' | 'default' | 'muted';
  progress?: number;
  onClick: () => void;
}): JSX.Element {
  const isLocked = tone === 'muted';
  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 22,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: `${MODE_ARTWORK_SIZE}px minmax(0, 1fr) 18px`,
        gap: 12,
        alignItems: 'center',
        background:
          tone === 'active'
            ? 'rgba(255, 255, 255, 0.64)'
            : 'rgba(255, 255, 255, 0.48)',
        border: '1px solid rgba(255,255,255,0.66)',
        boxShadow: '0 8px 22px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.78)',
        width: '100%',
        textAlign: 'left',
        color: 'inherit',
        appearance: 'none',
        WebkitAppearance: 'none',
        cursor: 'pointer',
      }}
    >
      {progress !== undefined && (
        <div
          aria-label={`Прогресс до любителей ${progress}%`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: 'rgba(15,23,42,0.08)',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--red)',
            }}
          />
        </div>
      )}
      <ModeArtwork label={title} tone={artwork} muted={isLocked} />
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            minWidth: 0,
            fontSize: 18,
            lineHeight: 1.05,
            fontWeight: 900,
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.64)',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {description}
        </div>
        <div
          style={{
            color: 'rgba(15, 23, 42, 0.54)',
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {meta}
        </div>
      </div>
      <ChevronRight
        aria-hidden="true"
        size={19}
        strokeWidth={2.7}
        style={{
          justifySelf: 'end',
          color: 'rgba(15, 23, 42, 0.56)',
        }}
      />
    </button>
  );
}

function ModeInfoModal({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{text}</div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function ModeArtwork({
  label,
  tone,
  muted,
}: {
  label: string;
  tone: LevelArtwork;
  muted: boolean;
}): JSX.Element {
  const imageSrc = MODE_ARTWORK_IMAGES[tone];
  const palette =
    tone === 'beginner'
      ? {
          bg: 'linear-gradient(145deg, #dbeafe 0%, #f8fafc 48%, #bfdbfe 100%)',
          line: 'rgba(220, 38, 38, 0.34)',
        }
      : tone === 'amateur'
        ? {
            bg: 'linear-gradient(145deg, #d1fae5 0%, #fefce8 52%, #bbf7d0 100%)',
            line: 'rgba(217, 119, 6, 0.36)',
          }
        : {
            bg: 'linear-gradient(145deg, #e2e8f0 0%, #f8fafc 52%, #cbd5e1 100%)',
            line: 'rgba(71, 85, 105, 0.32)',
          };

  return (
    <div
      aria-label={`Изображение режима ${label}`}
      style={{
        position: 'relative',
        width: MODE_ARTWORK_SIZE,
        height: MODE_ARTWORK_SIZE,
        aspectRatio: '1 / 1',
        alignSelf: 'center',
        justifySelf: 'center',
        borderRadius: 22,
        overflow: 'hidden',
        background: palette.bg,
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
        opacity: 1,
      }}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: muted ? 'grayscale(1) saturate(0.1)' : 'none',
            opacity: muted ? 0.58 : 1,
          }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0 46%, rgba(255,255,255,0.55) 46% 54%, transparent 54% 100%)',
          opacity: imageSrc ? 0 : 1,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 68,
          height: 68,
          borderRadius: '50%',
          border: `7px solid ${palette.line}`,
          transform: 'translate(-50%, -50%)',
          opacity: imageSrc ? 0 : 1,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 4,
          transform: 'translateY(-50%)',
          background: palette.line,
          opacity: imageSrc ? 0 : 1,
        }}
      />
    </div>
  );
}

function ModeShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <main
      className="screen"
      style={{
        padding: 'calc(16px + var(--app-safe-top)) 14px calc(92px + var(--app-safe-bottom))',
        gap: 14,
      }}
    >
      <section
        className="glass"
        style={{
          borderRadius: 24,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn glass"
            onClick={onBack}
            aria-label="Назад"
            title="Назад"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              minHeight: 40,
              borderRadius: 999,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

function TrainingPlaceholder({ onBack }: { onBack: () => void }): JSX.Element {
  const data = useTrainingSessionStore((s) => s.data);
  const loading = useTrainingSessionStore((s) => s.loading);
  const error = useTrainingSessionStore((s) => s.error);
  const inFlight = useTrainingSessionStore((s) => s.inFlight);
  const refresh = useTrainingSessionStore((s) => s.refresh);
  const start = useTrainingSessionStore((s) => s.start);
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 2 | 3>(1);
  const [playTraining, setPlayTraining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refreshedTrainingDayRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (data?.selected_period === 1 || data?.selected_period === 2 || data?.selected_period === 3) {
      setSelectedPeriod(data.selected_period);
    }
  }, [data?.selected_period]);

  useEffect(() => {
    if (data?.state !== 'active') setPlayTraining(false);
  }, [data?.state]);

  const shotsLimit = data?.shots_limit ?? 500;
  const shotsTaken = data?.shots_taken ?? 0;
  const goals = data?.goals ?? 0;
  const accuracy = shotsTaken > 0 ? Math.round((goals / shotsTaken) * 100) : 0;
  const nextDayAt = data ? new Date(data.next_day_starts_at).getTime() : 0;
  const nextDayRemaining = Math.max(0, nextDayAt - now);
  const canConfigureTraining = !data || data.state === 'idle' || data.state === 'active';
  const trainingActionLabel =
    data?.state === 'active' ? 'Продолжить тренировку' : 'Начать тренировку';

  useEffect(() => {
    if (!data) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data?.next_day_starts_at]);

  useEffect(() => {
    const nextDayIso = data?.next_day_starts_at;
    if (!nextDayIso || nextDayAt <= 0 || nextDayRemaining > 0) return;
    if (now - nextDayAt > 1500) return;
    if (refreshedTrainingDayRef.current === nextDayIso) return;
    refreshedTrainingDayRef.current = nextDayIso;
    void refresh();
  }, [data?.next_day_starts_at, nextDayAt, nextDayRemaining, now, refresh]);

  const handleTrainingAction = async (): Promise<void> => {
    const next = await start(selectedPeriod);
    if (next?.state === 'active') setPlayTraining(true);
  };

  if (data?.state === 'active' && playTraining) {
    return <TrainingPlayView onBack={() => setPlayTraining(false)} />;
  }

  return (
    <ModeShell title="Тренировка" onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <TotalCell label="ЛИМИТ" value={`${shotsTaken}/${shotsLimit}`} />
        <TotalCell label="ЧАСТОТА" value="24ч" />
        <TotalCell label="ДО ОБНОВЛЕНИЯ" value={data ? formatHms(nextDayRemaining) : '--:--:--'} />
      </div>
      {loading && !data ? (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка...</div>
      ) : (
        <>
          {error && (
            <div style={{ color: 'var(--red-deep, #b91c1c)', fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}
          {canConfigureTraining && (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
                Выбери модель периода. Скорости игрока, ворот, шайбы и вратаря будут такими же, как
                в дневной игре выбранного периода.
              </div>
              <SegmentedControl
                ariaLabel="Период тренировки"
                items={[
                  { id: '1', label: '1 период' },
                  { id: '2', label: '2 период' },
                  { id: '3', label: '3 период' },
                ]}
                value={String(selectedPeriod)}
                onChange={(id) => setSelectedPeriod(Number(id) as 1 | 2 | 3)}
              />
              <PeriodSpeedSummary periodNumber={selectedPeriod} />
              <button
                type="button"
                className="btn btn--cta"
                disabled={inFlight}
                onClick={() => void handleTrainingAction()}
              >
                {trainingActionLabel}
              </button>
            </>
          )}
          {data?.state === 'closed' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <TotalCell label="ГОЛЫ" value={String(goals)} />
                <TotalCell label="БРОСКИ" value={`${shotsTaken}/${shotsLimit}`} />
                <TotalCell label="ТОЧНОСТЬ" value={`${accuracy}%`} />
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
                Тренировка на сегодня завершена. Новая откроется завтра.
              </div>
            </>
          )}
        </>
      )}
    </ModeShell>
  );
}

function LevelPlaceholder({
  level,
  onBack,
}: {
  level: Exclude<GameLevel, 'beginner'>;
  onBack: () => void;
}): JSX.Element {
  const isAmateur = level === 'amateur';
  return (
    <ModeShell title={isAmateur ? 'Любители' : 'Профессионалы'} onBack={onBack}>
      {isAmateur ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <TotalCell label="ДОСТУП" value="1000" />
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
            Раздел откроется после 1000 голов в дневной игре начального уровня.
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>
          Профессиональный раздел в разработке.
        </div>
      )}
      <button type="button" className="btn btn--cta" disabled>
        {isAmateur ? 'Закрыто' : 'В разработке'}
      </button>
    </ModeShell>
  );
}

function PeriodSpeedSummary({ periodNumber }: { periodNumber: 1 | 2 | 3 }): JSX.Element {
  const preset = getDailyPeriodSpeedPreset(periodNumber);
  const items = [
    { label: 'Ворота', value: `${formatSpeedValue(preset.goalFrequency)}/с` },
    { label: 'Вратарь', value: `${formatSpeedValue(preset.goalieFrequency)}/с` },
    { label: 'Игрок', value: `${formatSpeedValue(preset.shooterFrequency)}/с` },
    { label: 'Шайба', value: `${formatSpeedValue(preset.puckSpeedPerMs)} ед/мс` },
  ];

  return (
    <div
      aria-label={`${periodNumber}-й период: скорости`}
      style={{
        padding: 12,
        borderRadius: 18,
        background: 'rgba(255, 255, 255, 0.34)',
        border: '1px solid rgba(255, 255, 255, 0.64)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.68)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          color: 'rgba(15, 23, 42, 0.58)',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        Скорости {periodNumber}-го периода
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'rgba(15, 23, 42, 0.54)',
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'var(--ink)',
                fontSize: 15,
                fontWeight: 900,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: string }): JSX.Element {
  const isLongLabel = label.length > 9;
  const isLongValue = value.length > 5;
  return (
    <div
      style={{
        padding: '10px 4px',
        borderRadius: 14,
        background:
          'linear-gradient(180deg, rgba(255, 255, 255, 0.7) 0%, rgba(226, 232, 240, 0.55) 100%)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: isLongLabel ? 7 : 9,
          letterSpacing: isLongLabel ? '0.08em' : '0.18em',
          lineHeight: 1.1,
          fontWeight: 800,
          color: 'var(--muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: isLongValue ? 16 : 18,
          fontWeight: 800,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

interface PlayViewProps<TState> {
  suppressedByModal: boolean;
  onBack: () => void;
  active: boolean;
  seed: string | null;
  goalieId: string;
  periodNumber: number;
  periodsTotal?: number;
  goals: number;
  shots: number;
  shotsTotal: number;
  timer?: string | undefined;
  timerLabel?: string | undefined;
  shotButtonLabel?: string | undefined;
  backLabel?: string | undefined;
  periodEndsAt?: number | undefined;
  onTimerExpired?: (() => void | Promise<void>) | undefined;
  optimisticAddShot: (claimed: ShotResultType) => void;
  submitShot: (args: {
    shotIndex: number;
    input: ShotInputPayload;
    claimedResult: ShotResultType;
  }) => Promise<{ serverResult: ShotResultType; state: TState } | null>;
  applyState: (next: TState) => void;
}

interface PlaySessionSnapshot {
  active: boolean;
  seed: string | null;
  goalieId: string;
  periodNumber: number;
  shots: number;
  shotsTotal: number;
}

function DailyPlayView({
  suppressedByModal,
  onBack,
}: {
  suppressedByModal: boolean;
  onBack: () => void;
}): JSX.Element {
  const data = useDailyStore((s) => s.data)!;
  const optimisticAddShot = useDailyStore((s) => s.optimisticAddShot);
  const submitShot = useDailyStore((s) => s.submitShot);
  const refresh = useDailyStore((s) => s.refresh);
  const applyState = useDailyStore((s) => s.applyState);
  const isBreak = data.state === 'break_active';
  const periodNumber = isBreak
    ? Math.min(data.current_period + 1, data.total_periods)
    : data.current_period > 0
      ? data.current_period
      : 1;
  const periodEndsAt = data.period_ends_at ? new Date(data.period_ends_at).getTime() : undefined;
  const breakEndsAt = data.break_ends_at ? new Date(data.break_ends_at).getTime() : undefined;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isBreak || !breakEndsAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [breakEndsAt, isBreak]);

  const breakRemaining = breakEndsAt ? Math.max(0, breakEndsAt - now) : 0;

  useEffect(() => {
    if (isBreak && breakEndsAt && breakRemaining === 0) void refresh();
  }, [breakEndsAt, breakRemaining, isBreak, refresh]);

  return (
    <PlayView<DailyStateResponse>
      suppressedByModal={suppressedByModal}
      onBack={onBack}
      active={data.state === 'period_active'}
      seed={data.daily_seed}
      goalieId={data.goalie_id}
      periodNumber={periodNumber}
      goals={isBreak ? data.daily_total_goals : data.current_period_goals}
      shots={isBreak ? data.daily_total_shots : data.current_period_shots}
      shotsTotal={isBreak ? data.shots_per_period * data.total_periods : data.shots_per_period}
      timer={isBreak ? formatMs(breakRemaining) : undefined}
      timerLabel={isBreak ? 'ПЕРЕРЫВ' : undefined}
      shotButtonLabel={isBreak ? 'ПЕРЕРЫВ' : undefined}
      periodEndsAt={isBreak ? undefined : periodEndsAt}
      onTimerExpired={refresh}
      optimisticAddShot={optimisticAddShot}
      submitShot={submitShot}
      applyState={applyState}
    />
  );
}

function TrainingPlayView({ onBack }: { onBack: () => void }): JSX.Element | null {
  const data = useTrainingSessionStore((s) => s.data);
  const optimisticAddShot = useTrainingSessionStore((s) => s.optimisticAddShot);
  const submitShot = useTrainingSessionStore((s) => s.submitShot);
  const applyState = useTrainingSessionStore((s) => s.applyState);

  if (!data) return null;

  return (
    <PlayView<TrainingStateResponse>
      suppressedByModal={false}
      onBack={onBack}
      active={data.state === 'active'}
      seed={data.training_seed}
      goalieId={data.goalie_id}
      periodNumber={data.selected_period ?? 1}
      goals={data.goals}
      shots={data.shots_taken}
      shotsTotal={data.shots_limit}
      timer={String(data.shots_limit)}
      timerLabel="ЛИМИТ"
      backLabel="К тренировке"
      optimisticAddShot={optimisticAddShot}
      submitShot={submitShot}
      applyState={applyState}
    />
  );
}

function PlayView<TState>({
  suppressedByModal,
  onBack,
  active,
  seed,
  goalieId,
  periodNumber,
  periodsTotal = 3,
  goals,
  shots,
  shotsTotal,
  timer,
  timerLabel,
  shotButtonLabel = 'БРОСОК',
  backLabel = 'К режимам',
  periodEndsAt,
  onTimerExpired,
  optimisticAddShot,
  submitShot,
  applyState,
}: PlayViewProps<TState>): JSX.Element {
  const session: PlaySessionSnapshot = useMemo(
    () => ({
      active,
      seed,
      goalieId,
      periodNumber,
      shots,
      shotsTotal,
    }),
    [active, seed, goalieId, periodNumber, shots, shotsTotal],
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const scaleRef = useRef<Scale>({ factor: 1, offsetX: 0, offsetY: 0 });
  const loopRef = useRef<GameLoop | null>(null);
  const puckRef = useRef<Puck | null>(null);
  const playerRef = useRef<Player | null>(null);
  const goalRef = useRef<Goal | null>(null);
  const goalieRef = useRef<Goalie | null>(null);
  const hitboxesRef = useRef<Hitboxes | null>(null);
  const refreshRef = useRef<((s: Scale) => void) | null>(null);
  const tickerRef = useRef<Ticker | null>(null);
  const entranceRafRef = useRef<number | null>(null);
  const iceCarRef = useRef<IceCar | null>(null);
  const iceCarRafRef = useRef<number | null>(null);
  const shotTimeoutsRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const [isShowingResult, setIsShowingResult] = useState(false);
  const [isShotInProgress, setIsShotInProgress] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) !== 'false';
  });
  const [resultSubText, setResultSubText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ShotResult | null>(null);
  // Server state is held until shot animation ends, so ScoreBoard counters
  // don't jump while the puck is still flying.
  const pendingMidShotApplyRef = useRef<(() => void) | null>(null);
  const [pixiReady, setPixiReady] = useState(false);
  // Ref-mirror of suppressedByModal so handleReady (initialized once via
  // useCallback) can read the latest value when Pixi finishes loading.
  const suppressedRef = useRef(suppressedByModal);
  suppressedRef.current = suppressedByModal;

  const speeds = useMemo(() => speedOverridesForPeriod(periodNumber), [periodNumber]);
  const speedsRef = useRef<SpeedOverrides>(speeds);
  speedsRef.current = speeds;

  const flightDurationMs = useMemo(
    () => (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeed,
    [speeds.puckSpeed],
  );

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? 'true' : 'false');
  }, [soundEnabled]);

  useEffect(() => {
    if (!periodEndsAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [periodEndsAt]);
  const remaining = periodEndsAt ? Math.max(0, periodEndsAt - now) : 0;

  useEffect(() => {
    if (remaining === 0 && periodEndsAt) void onTimerExpired?.();
  }, [remaining, periodEndsAt, onTimerExpired]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loopRef.current?.detach();
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      if (iceCarRafRef.current !== null) {
        cancelAnimationFrame(iceCarRafRef.current);
        iceCarRafRef.current = null;
      }
      for (const id of shotTimeoutsRef.current) window.clearTimeout(id);
      shotTimeoutsRef.current = [];
      goalRef.current?.destroy();
      goalieRef.current?.destroy();
      playerRef.current?.destroy();
      puckRef.current?.destroy();
      hitboxesRef.current?.destroy();
      iceCarRef.current?.destroy();
      loopRef.current = null;
      tickerRef.current = null;
      refreshRef.current = null;
      goalRef.current = null;
      goalieRef.current = null;
      playerRef.current = null;
      puckRef.current = null;
      hitboxesRef.current = null;
      iceCarRef.current = null;
    };
  }, []);

  const handleReady = useCallback((app: Application, initialScale: Scale): void => {
    scaleRef.current = initialScale;

    const goal = new Goal();
    const goalie = new Goalie();
    const hitboxes = new Hitboxes();
    const grip = useAuthStore.getState().user?.grip ?? 'left';
    const puck = new Puck(grip);
    const player = new Player(grip);
    puckRef.current = puck;
    playerRef.current = player;
    goalRef.current = goal;
    goalieRef.current = goalie;
    hitboxesRef.current = hitboxes;

    const iceCar = new IceCar();
    iceCarRef.current = iceCar;

    const layer = new Container();
    layer.addChild(iceCar.container);
    layer.addChild(goal.container);
    layer.addChild(goalie.container);
    layer.addChild(player.container);
    layer.addChild(puck.container);
    layer.addChild(hitboxes.container);

    app.stage.addChild(layer);

    const refreshScale = (s: Scale): void => {
      scaleRef.current = s;
      goal.update(s);
      player.update(s);
      puck.resetAtStart(s);
    };
    refreshRef.current = refreshScale;
    refreshScale(initialScale);

    const loop = createGameLoop({
      goalRenderer: goal,
      goalieRenderer: goalie,
      playerRenderer: player,
      puckRenderer: puck,
      hitboxRenderer: hitboxes,
      getScale: () => scaleRef.current,
      getSeed: () => sessionRef.current.seed ?? 'fallback',
      getShotIndex: () => sessionRef.current.shots + 1,
      getGoalieId: () => sessionRef.current.goalieId,
      getSpeedOverrides: () => speedsRef.current,
    });
    tickerRef.current = app.ticker;
    loopRef.current = loop;

    const startIceCarLoop = (): void => {
      let t0 = -1;
      const carStep = (rafTime: number): void => {
        if (!mountedRef.current) return;
        if (t0 < 0) t0 = rafTime;
        const pos = iceCarPosAt(rafTime - t0);
        iceCarRef.current?.update(scaleRef.current, pos.x, pos.y, pos.rot);
        iceCarRafRef.current = requestAnimationFrame(carStep);
      };
      iceCarRafRef.current = requestAnimationFrame(carStep);
    };

    // Decide initial visibility/loop state synchronously, BEFORE the first
    // ticker frame, so a modal-on-top mount never flashes moving sprites.
    if (suppressedRef.current) {
      player.container.visible = false;
      goalie.container.visible = false;
      puck.container.visible = false;
      goal.update(initialScale, 0);
      iceCar.container.visible = true;
      startIceCarLoop();
    } else {
      iceCar.container.visible = false;
      loop.attach(app.ticker);
    }
    setPixiReady(true);
  }, []);

  // React to suppressedByModal flips after Pixi is up. handleReady applies
  // the initial state inline; this hook handles transitions only.
  useLayoutEffect(() => {
    if (!pixiReady) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const loop = loopRef.current;
    const goal = goalRef.current;
    const player = playerRef.current;
    const goalie = goalieRef.current;
    const puck = puckRef.current;
    const ticker = tickerRef.current;
    if (!loop || !goal || !player || !goalie || !puck || !ticker) return;
    if (suppressedByModal) {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      loop.detach();
      goal.update(scaleRef.current, 0);
      player.container.visible = false;
      goalie.container.visible = false;
      puck.container.visible = false;
      if (iceCarRafRef.current === null) {
        const iceCar = iceCarRef.current;
        if (iceCar) {
          iceCar.container.visible = true;
          let t0 = -1;
          const carStep = (rafTime: number): void => {
            if (!mountedRef.current) return;
            if (t0 < 0) t0 = rafTime;
            const pos = iceCarPosAt(rafTime - t0);
            iceCar.update(scaleRef.current, pos.x, pos.y, pos.rot);
            iceCarRafRef.current = requestAnimationFrame(carStep);
          };
          iceCarRafRef.current = requestAnimationFrame(carStep);
        }
      }
      return;
    }

    if (iceCarRafRef.current !== null) {
      cancelAnimationFrame(iceCarRafRef.current);
      iceCarRafRef.current = null;
    }
    if (iceCarRef.current) iceCarRef.current.container.visible = false;

    // Modal closed → players skate out from center-ice area diagonally to
    // their spots. Goalie enters from above the red line, player from below,
    // so they never cross paths.
    const ENTRY_DURATION_MS = 1400;
    const CENTER_RED_Y = 350;
    const ENTRY_X = RINK.width + 50;
    const goalieStartX = ENTRY_X;
    const goalieStartY = CENTER_RED_Y - 30;
    const playerStartX = ENTRY_X;
    const playerStartY = CENTER_RED_Y + 30;
    const t0 = performance.now();
    player.container.visible = true;
    goalie.container.visible = true;
    puck.container.visible = false;
    const drawAt = (gx: number, gy: number, px: number, py: number): void => {
      player.update(scaleRef.current, px, py);
      goalie.update(
        {
          position: { x: gx, y: gy },
          width: GOALIE_SIZE.width,
          height: GOALIE_SIZE.height,
        },
        scaleRef.current,
      );
    };
    drawAt(goalieStartX, goalieStartY, playerStartX, playerStartY);
    const step = (): void => {
      if (!mountedRef.current) return;
      const t = Math.min(1, (performance.now() - t0) / ENTRY_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      drawAt(
        goalieStartX + (SHOOTER_CENTER_X - goalieStartX) * eased,
        goalieStartY + (GOALIE_Y - goalieStartY) * eased,
        playerStartX + (SHOOTER_CENTER_X - playerStartX) * eased,
        playerStartY + (PUCK_START.y - playerStartY) * eased,
      );
      if (t < 1) {
        entranceRafRef.current = requestAnimationFrame(step);
      } else {
        entranceRafRef.current = null;
        puck.container.visible = true;
        // Reset before attach so goal/goalie pick up motion from t=0 instead
        // of a long-accumulated time that would snap them mid-cycle.
        loop.resetTime();
        loop.attach(ticker);
      }
    };
    entranceRafRef.current = requestAnimationFrame(step);
    return () => {
      if (entranceRafRef.current !== null) {
        cancelAnimationFrame(entranceRafRef.current);
        entranceRafRef.current = null;
      }
      if (iceCarRafRef.current !== null) {
        cancelAnimationFrame(iceCarRafRef.current);
        iceCarRafRef.current = null;
      }
    };
  }, [suppressedByModal, pixiReady]);

  const handleResize = useCallback((s: Scale): void => {
    refreshRef.current?.(s);
  }, []);

  const handleShotTap = useCallback((): void => {
    const loop = loopRef.current;
    const puck = puckRef.current;
    const goalie = goalieRef.current;
    const cur = sessionRef.current;
    if (!loop || !puck || !goalie) return;
    if (puck.isFlying() || puck.isHeld()) return;
    if (!cur.active) return;
    if (!cur.seed) return;
    if (cur.shots >= cur.shotsTotal) return;

    const shotIndex = cur.shots + 1;
    const goalieCfg = getGoalie(cur.goalieId);
    const overrides = speedsRef.current;
    // Apply the same frequency overrides that resolveShot uses internally, so
    // subText simulateGoal/simulateGoalie calls see the same goal/goalie
    // positions as the resolver did.
    const activeCfg = {
      ...goalieCfg,
      frequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const seed = deriveShotSeed(cur.seed, cur.periodNumber, shotIndex);
    const offsets = getSessionPhaseOffsets(cur.seed);

    const tapTime = loop.getSceneT();
    const shooterTapTime = loop.getShooterT();
    const sx = computeShooterX(shooterTapTime + offsets.shooter, overrides.shooterFreq);

    const input = {
      tapTime,
      shooterTapTime,
      puckSpeedPerMs: overrides.puckSpeed,
      shooterFrequency: overrides.shooterFreq,
      goalieFrequency: overrides.goalieFreq,
      goalFrequency: overrides.goalFreq,
    };
    const result: ShotResult = resolveShot(
      input,
      activeCfg,
      seed,
      shotIndex,
      STICK_NEUTRAL,
      offsets,
    );

    let subText: string | null = null;
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / overrides.puckSpeed;
    const tGoalCross = tapTime + flightMs;
    const tGoalieCross = tapTime + (PUCK_START.y - GOALIE_Y) / overrides.puckSpeed;
    if (result.type === 'save') {
      const gs = simulateGoalie(activeCfg, seed, shotIndex, tGoalieCross, offsets.goalie);
      const rel = sx - gs.position.x;
      const sixth = gs.width / 6;
      subText =
        rel < -sixth
          ? 'Уверенная игра блином'
          : rel > sixth
            ? 'Точно в ловушку!'
            : 'Вратарь на месте!';
    } else if (result.type === 'goal') {
      const goalOffsetAtCross = simulateGoal(activeCfg, tGoalCross, offsets.goal).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtCross;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtCross;
      const rel = (sx - oMin) / (oMax - oMin);
      if (rel < 1 / 6 || rel > 5 / 6) subText = 'Точно в девятку!';
      else if (rel < 2 / 6 || rel > 4 / 6)
        subText = Math.random() < 0.5 ? 'Мощный щелчок!' : 'Отличный кистевой!';
      else subText = 'Отличный бросок!';
    } else if (result.type === 'miss') {
      const goalOffsetAtCross = simulateGoal(activeCfg, tGoalCross, offsets.goal).offsetX;
      const oMin = GOAL_OPENING.xMin + goalOffsetAtCross;
      const oMax = GOAL_OPENING.xMax + goalOffsetAtCross;
      const dist = Math.max(oMin - sx, sx - oMax, 0);
      subText =
        dist <= 3
          ? 'Штанга спасает!'
          : dist < 18
            ? 'Рядом со штангой!'
            : dist < 48
              ? 'Но было опасно!'
              : 'Очень далеко...';
    }

    optimisticAddShot(result.type);
    setIsShotInProgress(true);
    pendingMidShotApplyRef.current = null;

    loop.beginShooterPause();
    playerRef.current?.playShot();
    puck.playShot(
      puck.bladePoint(sx),
      { x: sx, y: GOAL_OPENING.y },
      performance.now(),
      flightDurationMs,
    );

    const scheduleShotTimeout = (fn: () => void, delay: number): void => {
      const id = window.setTimeout(() => {
        shotTimeoutsRef.current = shotTimeoutsRef.current.filter((timeoutId) => timeoutId !== id);
        if (!mountedRef.current) return;
        fn();
      }, delay);
      shotTimeoutsRef.current.push(id);
    };

    scheduleShotTimeout(() => {
      loop.beginScenePause();
      puck.holdAt({ x: sx, y: result.type === 'save' ? GOAL_OPENING.y + 20 : GOAL_OPENING.y });
      if (result.type === 'save') goalie.setSavePose(true);
      if (result.type === 'goal') goalRef.current?.triggerGoalLight();
      setLastResult(result);
      setResultSubText(subText);
      setIsShowingResult(true);
    }, flightDurationMs);

    scheduleShotTimeout(() => {
      loop.endScenePause();
      loop.endShooterPause();
      puck.release();
      if (result.type === 'save') goalie.setSavePose(false);
      setIsShowingResult(false);
      setIsShotInProgress(false);
      const applyPending = pendingMidShotApplyRef.current;
      if (applyPending) {
        applyPending();
        pendingMidShotApplyRef.current = null;
      }
    }, flightDurationMs + PAUSE_MS);

    void submitShot({
      shotIndex,
      input,
      claimedResult: result.type,
    }).then((res) => {
      if (!mountedRef.current) return;
      if (res === null) return;
      pendingMidShotApplyRef.current = () => applyState(res.state);
    });
  }, [flightDurationMs, optimisticAddShot, submitShot, applyState]);

  const timerValue = timer ?? formatMs(remaining);

  return (
    <main
      className="screen"
      style={{
        position: 'fixed',
        top: 'calc(var(--app-safe-top) + 6px)',
        left: 0,
        right: 0,
        bottom: 'calc(76px + var(--app-safe-bottom))',
        minHeight: 0,
      }}
    >
      <div style={{ margin: '12px 14px 10px' }}>
        <ScoreBoard
          period={periodNumber}
          periodsTotal={periodsTotal}
          timer={timerValue}
          timerLabel={timerLabel}
          goals={goals}
          shots={shots}
          shotsTotal={shotsTotal}
        />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 14px 10px',
        }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: '572 / 700',
            width: '100%',
            maxHeight: '100%',
            borderRadius: 64,
            overflow: 'hidden',
            border: '3px solid #1e3a5f',
            background: '#EAF1F8',
          }}
        >
          <RinkSvg />
          <div style={{ position: 'absolute', inset: 0 }}>
            <PixiStage onReady={handleReady} onResize={handleResize} />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '0 14px 10px',
          display: 'grid',
          gridTemplateColumns: '56px minmax(0, 1fr) 56px',
          gap: 10,
          alignItems: 'center',
          width: '100%',
          maxWidth: 344,
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          onClick={onBack}
          className="icon-btn icon-btn--dark"
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
          }}
        >
          <Home size={22} />
        </button>
        <button
          type="button"
          className="btn btn--cta"
          onClick={handleShotTap}
          disabled={
            suppressedByModal ||
            isShotInProgress ||
            isShowingResult ||
            !active ||
            shots >= shotsTotal
          }
          style={{
            width: '100%',
            minHeight: 58,
            padding: '0 22px',
            letterSpacing: '0.12em',
            fontSize: 16,
          }}
        >
          {shotButtonLabel}
        </button>
        <button
          type="button"
          aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          aria-pressed={!soundEnabled}
          title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          className="icon-btn"
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
            background: soundEnabled ? 'var(--glass-bg)' : 'rgba(15, 23, 42, 0.9)',
            color: soundEnabled ? 'var(--ink)' : '#ffffff',
            border: soundEnabled
              ? '1px solid var(--glass-border)'
              : '1px solid rgba(15, 23, 42, 0.9)',
          }}
        >
          {soundEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>

      {isShowingResult && lastResult && (
        <ResultModal result={lastResult} durationMs={PAUSE_MS} subText={resultSubText} />
      )}
    </main>
  );
}
