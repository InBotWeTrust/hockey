import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AmateurDuelKind, AmateurDuelOverview } from '../../api/amateurDuel.js';

const PERIODS = [
  { key: 'daily', label: 'Сегодня' },
  { key: 'weekly', label: 'Неделя' },
  { key: 'monthly', label: 'Месяц' },
] as const;
const FORMATS: Array<{ key: AmateurDuelKind; label: string }> = [
  { key: 'express', label: 'Экспресс' },
  { key: 'express_plus', label: 'Микс' },
  { key: 'classic', label: 'Классика' },
];

function countdown(resetAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((new Date(resetAt).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [days && `${days} д`, hours && `${hours} ч`, minutes && `${minutes} мин`, days === 0 && `${rest} сек`].filter(Boolean).join(' ');
}

export function DuelLimitsSection({
  limits,
  loading,
  onReset,
}: {
  limits: AmateurDuelOverview['duel_limits'];
  loading: boolean;
  onReset?: () => void;
}): JSX.Element {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!limits) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [limits]);
  useEffect(() => {
    if (!limits || !onReset) return;
    const next = Math.min(...PERIODS.map(({ key }) => new Date(limits[key].reset_at).getTime()));
    const delay = next - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(onReset, Math.min(delay + 1000, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [limits, onReset]);
  return (
    <section className="duel-section" aria-label="Лимиты дуэлей">
      <div className="section-label duel-section-title">Лимиты</div>
      <div className="glass duel-limits-card">
        {limits ? PERIODS.map(({ key, label }) => {
          const period = limits[key];
          const expanded = open.has(key);
          return (
            <div className="duel-limits-period" key={key}>
              <button
                className="duel-limits-period__toggle"
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((previous) => {
                  const next = new Set(previous);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })}
              >
                <span className="duel-limits-period__summary">{label} {Math.max(0, period.limit - period.used)}/{period.limit} <span className="duel-limits-period__timer">(до обновления: {countdown(period.reset_at, now)})</span></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="duel-limits-period__formats">
                  {FORMATS.map((format) => (
                    <div key={format.key}>
                      {format.label}: {key === 'monthly'
                        ? `осталось ${Math.max(0, limits.monthly.format_limit - period.by_format[format.key])} из ${limits.monthly.format_limit}`
                        : `сыграно ${period.by_format[format.key]}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }) : <div className="duel-limits-card__loading">
          {loading ? 'Загружаем лимиты…' : 'Лимиты пока недоступны'}
        </div>}
      </div>
    </section>
  );
}
