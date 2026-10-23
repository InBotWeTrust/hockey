import {useAmateurAccess} from '../../amateur/useAmateurAccess.js';
import { duelTemplateChoices } from '../../components/duel/duelTemplateChoices.js';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import {
  challengeAmateurDuel,
  checkAmateurDuelChallengeAvailability,
  fetchAmateurTemplates,
  type AmateurDuelKind,
  type AmateurDuelMatch,
  type AmateurDuelTemplate,
} from '../../api/amateurDuel.js';
import { ApiError } from '../../api/apiFetch.js';
import {
  amateurAccessDetailsFromError,
  guardAmateurMutation,
} from '../../amateur/amateurAccess.js';
import { AccessibleModal } from '../../components/AccessibleModal.js';

interface DuelChallengeModalProps {
  opponentUserId: string;
  opponentName: string;
  onClose: () => void;
  onCreated: () => void;
  onBlocked?: (message: string) => void;
}

const OPEN_DUEL_STATUSES = new Set(['invited', 'ready_check', 'active']);
const DUEL_KIND_ORDER: Record<AmateurDuelKind, number> = {
  express: 0,
  express_plus: 1,
  classic: 2,
  sniper: 3,
  marathon: 4,
  rhythm: 5,
};

export function hasOpenDuelWithUser(matches: AmateurDuelMatch[], userId: string): boolean {
  return matches.some(
    (match) => OPEN_DUEL_STATUSES.has(match.status) && match.opponent.user_id === userId,
  );
}

export function duelKindText(kind: AmateurDuelKind): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Микс';
  if (kind === 'sniper') return 'Снайпер';
  if (kind === 'marathon') return 'Марафон';
  if (kind === 'rhythm') return 'Ритм';
  return 'Классика';
}

function sortTemplates(templates: AmateurDuelTemplate[]): AmateurDuelTemplate[] {
  return [...templates].sort((a, b) => {
    const kindDiff = DUEL_KIND_ORDER[a.duel_kind] - DUEL_KIND_ORDER[b.duel_kind];
    if (kindDiff !== 0) return kindDiff;
    return a.title.localeCompare(b.title, 'ru');
  });
}

function templateMeta(template: AmateurDuelTemplate): string {
  const rules = template.period_rules.length > 0 ? template.period_rules : null;
  if (rules === null) {
    const minutes = Math.max(1, Math.round(template.period_duration_ms / 60_000));
    return `${template.total_periods} период(а) · ${minutes} мин`;
  }

  const firstRule = rules[0];
  if (!firstRule) return '';
  if (rules.length === 1) return periodRuleText(firstRule);

  if (template.duel_kind === 'express_plus') {
    return rules
      .map((rule) => {
        const label = rule.periodNumber === 1 ? '1-й период' : `${rule.periodNumber}-й период`;
        return `${label}: ${periodRuleText(rule)}`;
      })
      .join(' · ');
  }

  const sameQuota = rules.every(
    (rule) => rule.mode === 'quota' && rule.shotsLimit === firstRule.shotsLimit,
  );
  if (sameQuota && firstRule.shotsLimit !== null) {
    return `${rules.length} периода по ${firstRule.shotsLimit} бросков`;
  }

  return rules.map((rule) => `${rule.periodNumber}-й: ${periodRuleText(rule)}`).join(' · ');
}

function periodRuleText(rule: AmateurDuelTemplate['period_rules'][number]): string {
  if (rule.mode === 'quota' && rule.shotsLimit !== null) return `${rule.shotsLimit} бросков`;
  const minutes = Math.max(1, Math.round(rule.durationMs / 60_000));
  return `${minutes} мин`;
}

function challengeErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const limit = error.details?.duelLimit as { reason?: string; retryAt?: string } | undefined;
    if (limit?.reason) {
      return limitMessage({
        reason: ['daily', 'weekly', 'monthly', 'format', 'open_slots', 'outgoing', 'tournament'].includes(limit.reason)
          ? limit.reason as 'daily' | 'weekly' | 'monthly' | 'format' | 'open_slots' | 'outgoing' | 'tournament' : null,
        retryAt: limit.retryAt ?? null,
        player: null,
      });
    }
    if (error.message.includes('already exists')) {
      return 'С этим игроком уже есть открытая дуэль.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Не удалось отправить вызов';
}

function limitMessage(format: {
  reason: 'daily' | 'weekly' | 'monthly' | 'format' | 'open_slots' | 'outgoing' | 'tournament' | null;
  retryAt: string | null;
  player: 'self' | 'opponent' | null;
}): string {
  const who = format.player === 'opponent' ? 'У соперника'
    : format.player === 'self' ? 'У вас' : 'Достигнут';
  if (format.reason === 'open_slots') return `${who} уже две открытые дуэли.`;
  if (format.reason === 'tournament') return `${who} сейчас недоступны обычные дуэли из-за турнира.`;
  const reason = format.reason === 'daily' ? 'исчерпан дневной лимит дуэлей'
    : format.reason === 'weekly' ? 'исчерпан недельный лимит дуэлей'
      : format.reason === 'monthly' ? 'исчерпан месячный лимит дуэлей'
        : format.reason === 'format' ? 'исчерпан месячный лимит этого формата'
          : 'слишком много ожидающих приглашений';
  const reset = format.retryAt ? ` Сброс: ${new Date(format.retryAt).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  })}.` : '';
  return format.player === null
    ? `Лимит дуэлей достигнут. ${reason}.${reset}`
    : `${who} ${reason}.${reset}`;
}

export function DuelChallengeModal({
  opponentUserId,
  opponentName,
  onClose,
  onCreated,
  onBlocked,
}: DuelChallengeModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [marathonWindow, setMarathonWindow] = useState<4000 | 7000>(7000);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amateurAccess = useAmateurAccess();

  const templatesQuery = useQuery({
    queryKey: ['amateur-duel', 'templates'],
    queryFn: fetchAmateurTemplates,
    staleTime: 60_000,
  });
  const availabilityQuery = useQuery({
    queryKey: ['amateur-duel', 'challenge-availability', opponentUserId],
    queryFn: () => checkAmateurDuelChallengeAvailability(opponentUserId),
    staleTime: 0,
  });
  const templates = useMemo(
    () => sortTemplates(templatesQuery.data?.templates ?? []),
    [templatesQuery.data?.templates],
  );

  const choices = useMemo(() => duelTemplateChoices(templates), [templates]);

  useEffect(() => {
    if (templates.length === 0) return;
    if (availabilityQuery.data?.formats) {
      const current = templates.find((template) => template.id === selectedTemplateId);
      if (current && availabilityQuery.data.formats[current.duel_kind]?.available !== false) return;
      const first = templates.find((template) =>
        availabilityQuery.data.formats?.[template.duel_kind]?.available !== false);
      setSelectedTemplateId(first?.id ?? null);
      return;
    }
    if (availabilityQuery.data?.available === false) {
      setSelectedTemplateId(null);
      return;
    }
    if (
      selectedTemplateId !== null &&
      templates.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }
    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, templates, availabilityQuery.data]);

  const challengeMutation = useMutation({
    mutationFn: (templateId: string) =>
      challengeAmateurDuel({
        template_id: templateId,
        opponent_user_id: opponentUserId,
        ...(templates.find((item) => item.id === templateId)?.duel_kind === 'marathon'
          ? { marathon_window_ms: marathonWindow }
          : {}),
      }),
    onMutate: () => {
      setError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      onCreated();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void availabilityQuery.refetch();
      }
      if (amateurAccessDetailsFromError(err) !== null) {
        setError(null);
        return;
      }
      if (err instanceof ApiError && err.code === 'playoff_opponent_blocked' && onBlocked) {
        onClose();
        onBlocked(err.message);
        return;
      }
      setError(challengeErrorText(err));
    },
  });

  return (
    <AccessibleModal
      title="Тип дуэли"
      ariaLabel="Выбор типа дуэли"
      copy={<>Выберите формат вызова для {opponentName}.</>}
      onRequestClose={onClose}
      closeBlocked={challengeMutation.isPending}
      backdropStyle={{
        zIndex: 340,
        alignItems: 'flex-start',
        paddingTop: 'calc(48px + var(--app-safe-top))',
      }}
      cardStyle={{
        width: 'min(420px, calc(100vw - 28px))',
        maxHeight: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
      }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={challengeMutation.isPending}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {templatesQuery.isLoading && (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Загружаем форматы...
            </div>
          )}
          {templatesQuery.isError && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void templatesQuery.refetch()}
              style={{ minHeight: 48 }}
            >
              Повторить загрузку
            </button>
          )}
          {!templatesQuery.isLoading &&
            !templatesQuery.isError &&
            choices.map(({ template, value, marathonWindow: window }) => {
              const selected = template.id === selectedTemplateId && (window === undefined || window === marathonWindow);
              const availability = availabilityQuery.data?.formats?.[template.duel_kind];
              const blocked = availability?.available === false;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  disabled={blocked}
                  title={blocked ? limitMessage(availability) : undefined}
                  className="glass"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    if (window !== undefined) setMarathonWindow(window);
                    setError(null);
                  }}
                  style={{
                    borderRadius: 18,
                    padding: '12px 14px',
                    textAlign: 'left',
                    display: 'grid',
                    gap: 4,
                    gridTemplateColumns: 'minmax(0, 1fr) 20px',
                    cursor: 'pointer',
                    color: 'var(--ink)',
                    boxShadow: selected ? 'inset 0 0 0 2px #1f2a3d' : undefined,
                  }}
                >
                  {!blocked && (
                    <span
                      className={`duel-equipment-option__check${selected ? ' duel-equipment-option__check--selected' : ''}`}
                      style={{ gridColumn: 2, gridRow: '1 / span 3', alignSelf: 'center' }}
                      aria-hidden="true"
                    >
                      {selected ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                  )}
                  <span style={{ gridColumn: 1, fontSize: 15, fontWeight: 900 }}>
                    {duelKindText(template.duel_kind)}{window === undefined ? null : ` · ${window / 1000} сек`}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      gridColumn: 1,
                      color: 'var(--muted)',
                    }}
                  >
                    {templateMeta(template)}
                  </span>
                  {blocked && (
                    <span style={{ gridColumn: 1, fontSize: 12, color: 'var(--muted)' }}>
                      {limitMessage(availability)}
                    </span>
                  )}
                </button>
              );
            })}
          {!templatesQuery.isLoading && !templatesQuery.isError && templates.length === 0 && (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Активных форматов пока нет.
            </div>
          )}
        </div>

        {error && (
          <div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>{error}</div>
        )}

        <button
          type="button"
          className="modal-primary btn--cta"
          disabled={selectedTemplateId === null || challengeMutation.isPending ||
            (templates.find((item) => item.id === selectedTemplateId) !== undefined &&
              availabilityQuery.data?.formats?.[
                templates.find((item) => item.id === selectedTemplateId)!.duel_kind
              ]?.available === false)}
          onClick={() => {
            if (selectedTemplateId !== null) {
              guardAmateurMutation(amateurAccess, () =>
                challengeMutation.mutate(selectedTemplateId),
              );
            }
          }}
        >
          {challengeMutation.isPending ? 'Отправляем...' : 'Вызвать'}
        </button>
      </div>
    </AccessibleModal>
  );
}
