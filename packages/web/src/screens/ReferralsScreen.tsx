import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Star, TrendingUp } from 'lucide-react';
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
    <div className="section-label">{title} <span>{total}</span></div>
    <div className="glass referral-player-list">
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
      {total === 0 && !query.isLoading ? <p className="referral-empty">Пока никого</p> : null}
      {query.hasNextPage ? <button type="button" className="btn btn--ghost referral-load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}</button> : null}
    </div>
  </section>;
}

export function ReferralsScreen(): JSX.Element {
  const navigate = useNavigate();
  const [selectedPlayer, setSelectedPlayer] = useState<UserPickerItem | null>(null);
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  const summary = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
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
            <p>{summary.data.qualifiedInvited} друзей дошли до уровня «Любитель»</p>
          </div>
        </section>
      ) : null}
      {sections.map((section) => <ReferralSection key={section.level} {...section} onSelect={setSelectedPlayer} />)}
      <UserProfileSheet sender={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </main>
  );
}
