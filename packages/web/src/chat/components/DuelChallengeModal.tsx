import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  challengeAmateurDuel,
  fetchAmateurTemplates,
  type AmateurDuelKind,
  type AmateurDuelMatch,
  type AmateurDuelTemplate,
} from '../../api/amateurDuel.js';
import { ApiError } from '../../api/apiFetch.js';

interface DuelChallengeModalProps {
  opponentUserId: string;
  opponentName: string;
  onClose: () => void;
  onCreated: () => void;
}

const OPEN_DUEL_STATUSES = new Set(['invited', 'ready_check', 'active']);
const DUEL_KIND_ORDER: Record<AmateurDuelKind, number> = {
  express: 0,
  express_plus: 1,
  classic: 2,
};

export function hasOpenDuelWithUser(matches: AmateurDuelMatch[], userId: string): boolean {
  return matches.some(
    (match) => OPEN_DUEL_STATUSES.has(match.status) && match.opponent.user_id === userId,
  );
}

export function duelKindText(kind: AmateurDuelKind): string {
  if (kind === 'express') return 'Экспресс';
  if (kind === 'express_plus') return 'Экспресс+';
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
    if (error.message.includes('already exists')) {
      return 'С этим игроком уже есть открытая дуэль.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Не удалось отправить вызов';
}

export function DuelChallengeModal({
  opponentUserId,
  opponentName,
  onClose,
  onCreated,
}: DuelChallengeModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['amateur-duel', 'templates'],
    queryFn: fetchAmateurTemplates,
    staleTime: 60_000,
  });
  const templates = useMemo(
    () => sortTemplates(templatesQuery.data?.templates ?? []),
    [templatesQuery.data?.templates],
  );

  useEffect(() => {
    if (templates.length === 0) return;
    if (
      selectedTemplateId !== null &&
      templates.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }
    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, templates]);

  const challengeMutation = useMutation({
    mutationFn: (templateId: string) =>
      challengeAmateurDuel({ template_id: templateId, opponent_user_id: opponentUserId }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['amateur-duel'] });
      onCreated();
    },
    onError: (err) => setError(challengeErrorText(err)),
  });

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        zIndex: 340,
        alignItems: 'flex-start',
        paddingTop: 'calc(48px + var(--app-safe-top))',
      }}
    >
      <div
        role="dialog"
        aria-label="Выбор типа дуэли"
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, calc(100vw - 28px))', display: 'grid', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Тип дуэли</div>
            <div className="modal-copy">Выберите формат вызова для {opponentName}.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

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
            templates.map((template) => {
              const selected = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={selected ? 'glass-dark' : 'glass'}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setError(null);
                  }}
                  style={{
                    borderRadius: 18,
                    padding: '12px 14px',
                    textAlign: 'left',
                    display: 'grid',
                    gap: 4,
                    cursor: 'pointer',
                    color: selected ? '#ffffff' : 'var(--ink)',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 900 }}>
                    {duelKindText(template.duel_kind)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: selected ? 'rgba(255,255,255,0.78)' : 'var(--muted)',
                    }}
                  >
                    {templateMeta(template)}
                  </span>
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
          disabled={selectedTemplateId === null || challengeMutation.isPending}
          onClick={() => {
            if (selectedTemplateId !== null) challengeMutation.mutate(selectedTemplateId);
          }}
        >
          {challengeMutation.isPending ? 'Отправляем...' : 'Вызвать'}
        </button>
      </div>
    </div>
  );
}
