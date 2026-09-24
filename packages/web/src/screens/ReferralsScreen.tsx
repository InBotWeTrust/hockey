import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Copy, Star, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore.js';
import {
  claimReferralReward,
  fetchReferralInvitees,
  fetchReferralSummary,
  type ReferralLevel,
} from '../api/referrals.js';
import { UserProfileSheet } from '../chat/components/UserProfileSheet.js';
import type { UserPickerItem } from '../chat/api.js';
import { formatProfileNumber } from './profileSections.js';

const sections: Array<{ level: ReferralLevel; title: string }> = [
  { level: 'beginner', title: 'Новички' },
  { level: 'amateur', title: 'Любители' },
  { level: 'professional', title: 'Профи' },
];

function formatJoinedAt(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

function ReferralSection({ level, title, onSelect }: { level: ReferralLevel; title: string; onSelect: (player: UserPickerItem) => void }): JSX.Element {
  const query = useInfiniteQuery({
    queryKey: ['referrals', 'invitees', level],
    queryFn: ({ pageParam }) => fetchReferralInvitees(level, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  return <section className="referral-list-section">
    <div className="section-label">{title} <span className="referral-list-section__count">· {total}</span></div>
    {total === 0 && !query.isLoading ? (
      <p className="referral-empty referral-empty--inline">Пока никого</p>
    ) : <div className="glass referral-player-list">
      {query.isLoading ? <p className="referral-empty">Загружаем…</p> : null}
      {items.map((player) => <button type="button" className="referral-player" key={player.userId} onClick={() => onSelect({ userId: player.userId, displayName: player.displayName, avatarUrl: player.avatarUrl, accountKind: 'player' })}>
        <span className="referral-player__avatar">{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : player.displayName.charAt(0).toUpperCase()}</span>
        <span className="referral-player__copy">
          <strong>{player.displayName}</strong>
          <small>
            <span className="referral-player__experience" aria-label={`Опыт: ${player.experience}`}><TrendingUp aria-hidden="true" />{formatProfileNumber(player.experience)}</span>
            <span>· с {formatJoinedAt(player.joinedAt)}</span>
          </small>
        </span>
        <ChevronRight size={18} />
      </button>)}
      {query.hasNextPage ? <button type="button" className="btn btn--ghost referral-load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}</button> : null}
    </div>}
  </section>;
}

export function ReferralsScreen(): JSX.Element {
  const navigate = useNavigate();
  const [selectedPlayer, setSelectedPlayer] = useState<UserPickerItem | null>(null);
  const [copyToastSequence, setCopyToastSequence] = useState(0);
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const summary = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
  const inviteUrl = summary.data ? `${window.location.origin}/invite/${summary.data.code}` : '';
  useEffect(() => {
    if (copyToastSequence === 0) return undefined;
    const timer = window.setTimeout(() => setCopyToastSequence(0), 1_000);
    return () => window.clearTimeout(timer);
  }, [copyToastSequence]);
  const copy = (value: string): void => {
    void navigator.clipboard.writeText(value).then(() => setCopyToastSequence((value) => value + 1));
  };
  const nextMilestone = summary.data?.milestones.find((item) => item.unlockedAt === null) ?? null;
  const claim = useMutation({
    mutationFn: claimReferralReward,
    onSuccess: async (result) => {
      updateUser({
        starBalance: result.stars,
        unclaimedReferralRewardsCount: Math.max(0, (summary.data?.unclaimedRewardsCount ?? 1) - 1),
      });
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return (
    <main className="screen profile-detail-screen referrals-screen">
      <header className="profile-page-header page-header-standard">
        <button type="button" className="icon-btn page-header-standard__back" aria-label="Назад" onClick={() => navigate('/profile')}><ArrowLeft size={18} /></button>
        <h1 className="page-header-standard__title">Приглашённые друзья</h1>
      </header>
      {summary.data ? (
        <section className="referral-invite-card glass" aria-label="Как приглашать друзей">
          <div className="referral-invite-card__copy">
            <h2>Приглашай друзей</h2>
            <p>Поделись ссылкой или кодом – друг должен указать его при первой регистрации. Когда он перейдёт в «Любители», приглашение засчитается в шкале наград, а за открытые ступени можно будет забрать звёзды.</p>
            <p>Следи за прогрессом друзей ниже и напоминай им об игре, если они пропускают матчи.</p>
          </div>
          <div className="referral-invite-card__fields">
            <div className="referral-invite-field">
              <span><small>Код приглашения</small><strong>{summary.data.code}</strong></span>
              <button type="button" aria-label="Скопировать код приглашения" onClick={() => copy(summary.data.code)}><Copy size={15} /><span>Копировать</span></button>
            </div>
            <div className="referral-invite-field">
              <span><small>Ссылка для приглашения</small><strong>{inviteUrl}</strong></span>
              <button type="button" aria-label="Скопировать ссылку приглашения" onClick={() => copy(inviteUrl)}><Copy size={15} /><span>Копировать</span></button>
            </div>
          </div>
        </section>
      ) : null}
      {summary.data ? (
        <section className="referral-rewards-section" aria-label="Награды за приглашения">
          <div className="section-label">Шкала наград</div>
          <div className="referral-rewards glass">
            <div className="referral-rewards__track">
              {summary.data.milestones.map((item) => {
                const claimable = item.unlockedAt !== null && item.claimedAt === null && item.unlockId !== null;
                return <button key={item.id} type="button" className={`referral-reward${claimable ? ' referral-reward--claimable' : ''}`} disabled={!claimable || claim.isPending} onClick={() => item.unlockId && claim.mutate(item.unlockId)}>
                  <span>{item.claimedAt ? <Check size={15} /> : item.qualifiedReferrals}</span>
                  <strong><Star size={13} fill="currentColor" />{item.rewardStars}</strong>
                  {claimable ? <small>Забрать</small> : null}
                </button>;
              })}
            </div>
            {nextMilestone ? (
              <div
                className="referral-rewards__progress"
                role="progressbar"
                aria-label="Прогресс до следующей награды"
                aria-valuemin={0}
                aria-valuemax={nextMilestone.qualifiedReferrals}
                aria-valuenow={Math.min(summary.data.qualifiedInvited, nextMilestone.qualifiedReferrals)}
              >
                <span style={{ width: `${Math.min(100, (summary.data.qualifiedInvited / nextMilestone.qualifiedReferrals) * 100)}%` }} />
                <strong>{summary.data.qualifiedInvited} / {nextMilestone.qualifiedReferrals}</strong>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {summary.data?.totalInvited === 0 ? (
        <section className="referrals-empty-state glass" aria-label="Приглашённые друзья пока отсутствуют">
          <strong>Здесь появятся приглашённые друзья</strong>
          <span>Поделись ссылкой или кодом выше</span>
        </section>
      ) : summary.data ? sections.map((section) => <ReferralSection key={section.level} {...section} onSelect={setSelectedPlayer} />) : null}
      <UserProfileSheet sender={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      {copyToastSequence > 0 ? (
        <div className="achievement-reward-toast profile-referral-copy-toast" role="status" aria-live="polite">
          <strong className="achievement-reward-toast__title">Скопировано</strong>
        </div>
      ) : null}
    </main>
  );
}
