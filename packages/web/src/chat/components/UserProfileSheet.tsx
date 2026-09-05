import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Award, CircleDollarSign, Medal, Star, Target, TrendingUp, Trophy, X } from 'lucide-react';
import {
  fetchUserProfile,
  findOrCreateDM,
  type UserPickerItem,
  type UserPublicProfileDTO,
} from '../api.js';
import { fetchAmateurMatches } from '../../api/amateurDuel.js';
import { chatKeys, userKeys } from '../../lib/queryKeys.js';
import { UserAvatar } from './UserAvatar.js';
import type { ProfileAchievement } from '../../screens/profileTypes.js';
import {
  AchievementDetailsSheet,
  formatProfileNumber,
  getLevelLabel,
  ProfileAchievementsSection,
} from '../../screens/profileSections.js';
import { useAuthStore } from '../../auth/authStore.js';
import { DuelChallengeModal, hasOpenDuelWithUser } from './DuelChallengeModal.js';
import { Sheet } from '../../components/Sheet.js';

interface UserProfileSheetProps {
  sender: UserPickerItem | null;
  onClose: () => void;
}

function PublicBalance({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <div className="profile-balance">
      <span className="profile-balance__label">{label}</span>
      <span className={`profile-balance__amount profile-balance__amount--${tone}`}>
        {icon}
        <strong className="profile-balance__value" aria-label={`${label}: ${value}`}>
          {formatProfileNumber(value)}
        </strong>
      </span>
    </div>
  );
}

function PublicSportingPassport({
  profile,
  displayName,
  avatarUrl,
}: {
  profile: UserPublicProfileDTO;
  displayName: string;
  avatarUrl: string | null;
}): JSX.Element {
  const registeredDate = new Date(profile.createdAt);
  const registeredLabel = Number.isNaN(registeredDate.getTime())
    ? '—'
    : registeredDate.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
  const trophySummary = profile.trophySummary ?? {
    regularSeasonWins: 0,
    tournamentChampionships: 0,
    tournamentPodiums: 0,
    completedChallenges: 0,
  };
  const trophies = [
    ['Победы в регулярке', trophySummary.regularSeasonWins, Trophy],
    ['Чемпионства', trophySummary.tournamentChampionships, Award],
    ['Призовые места', trophySummary.tournamentPodiums, Medal],
    ['Челленджи', trophySummary.completedChallenges, Target],
  ] as const;

  return (
    <section
      className="profile-passport public-profile-passport"
      aria-label="Публичный спортивный паспорт"
    >
      <div className="profile-passport__top">
        <div className="profile-identity__main public-profile-identity">
          <UserAvatar avatarUrl={avatarUrl} name={displayName} size={80} fontSize={30} />
          <div className="profile-identity__copy">
            <span className="profile-identity__name public-profile-identity__name">
              {displayName}
            </span>
            <span className="profile-identity__level">
              {getLevelLabel(profile.competitionLevel)}
            </span>
          </div>
        </div>
        <div className="profile-balances" aria-label="Баланс игрока">
          <PublicBalance
            label="Монеты"
            value={profile.currencyBalance ?? 0}
            tone="coins"
            icon={<CircleDollarSign aria-hidden="true" />}
          />
          <PublicBalance
            label="Звёзды"
            value={profile.starBalance ?? 0}
            tone="stars"
            icon={<Star aria-hidden="true" />}
          />
          <PublicBalance
            label="Опыт"
            value={profile.experienceBalance ?? 0}
            tone="experience"
            icon={<TrendingUp aria-hidden="true" />}
          />
        </div>
      </div>
      <div className="profile-sporting-metrics" aria-label="Главные показатели">
        <div className="profile-sporting-metrics__item">
          <strong>{formatProfileNumber(profile.stats.goals)}</strong>
          <span>Голы</span>
        </div>
        <div className="profile-sporting-metrics__item">
          <strong>{formatProfileNumber(profile.stats.accuracy)}%</strong>
          <span>Точность</span>
        </div>
        <div className="profile-sporting-metrics__item">
          <strong>
            {formatProfileNumber(profile.stats.playStreakDays)}{' '}
            <span className="profile-streak-record">
              (
              {formatProfileNumber(
                profile.stats.bestPlayStreakDays ?? profile.stats.playStreakDays,
              )}
              )
            </span>
          </strong>
          <span>Дней подряд</span>
        </div>
        <div className="profile-sporting-metrics__item">
          <strong>
            {registeredLabel === '—' ? (
              registeredLabel
            ) : (
              <span className="profile-registration-date">
                <span className="profile-registration-date__prefix">с</span> {registeredLabel}
              </span>
            )}
          </strong>
          <span>В игре</span>
        </div>
      </div>
      <section className="profile-trophy-showcase" aria-label="Витрина наград">
        {trophies.map(([label, value, Icon]) => (
          <div className="profile-trophy-showcase__item" key={label}>
            <Icon aria-hidden="true" />
            <strong>{formatProfileNumber(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
    </section>
  );
}

export function UserProfileSheet({ sender, onClose }: UserProfileSheetProps): JSX.Element | null {
  if (!sender) return null;
  return <UserProfileSheetContent key={sender.userId} sender={sender} onClose={onClose} />;
}

function UserProfileSheetContent({
  sender,
  onClose,
}: {
  sender: UserPickerItem;
  onClose: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id ?? null);
  const senderId = sender.userId;
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [duelPickerOpen, setDuelPickerOpen] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: (otherUserId: string) => findOrCreateDM(otherUserId),
    onSuccess: ({ chatId, created }) => {
      if (created) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      }
      navigate(`/chat/${chatId}`);
      onClose();
    },
  });

  const { data: profile } = useQuery<UserPublicProfileDTO>({
    queryKey: userKeys.profile(senderId),
    queryFn: () => fetchUserProfile(senderId),
    enabled: senderId.length > 0,
    staleTime: 60_000,
  });
  const { data: myProfile } = useQuery<UserPublicProfileDTO>({
    queryKey: userKeys.profile(meId ?? ''),
    queryFn: () => fetchUserProfile(meId ?? ''),
    enabled: meId !== null,
    staleTime: 60_000,
  });

  const isSelf = sender?.userId === meId;
  const canCurrentUserDuel =
    myProfile?.competitionLevel === 'amateur' || myProfile?.competitionLevel === 'professional';
  const canDuel =
    !isSelf &&
    canCurrentUserDuel &&
    (profile?.competitionLevel === 'amateur' || profile?.competitionLevel === 'professional');
  const openMatchesQuery = useQuery({
    queryKey: ['amateur-duel', 'matches'],
    queryFn: fetchAmateurMatches,
    enabled: canDuel,
    staleTime: 10_000,
  });
  const hasOpenDuel = hasOpenDuelWithUser(openMatchesQuery.data?.matches ?? [], senderId);

  const displayName = profile?.displayName ?? sender.displayName;
  const avatarUrl = profile?.avatarUrl ?? sender.avatarUrl;
  const completedAchievements = (profile?.achievements ?? []).filter(
    (achievement) => achievement.isUnlocked,
  );

  return (
    <Sheet
      open
      title="Профиль игрока"
      onRequestClose={() => onClose()}
      maxHeight="94dvh"
      grabberPlacement="top"
      backdropTestId="profile-sheet-backdrop"
      headerAction={
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <X size={14} />
        </button>
      }
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {profile ? (
          <PublicSportingPassport
            profile={profile}
            displayName={displayName}
            avatarUrl={avatarUrl}
          />
        ) : (
          <div
            className="glass"
            style={{
              minHeight: 74,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            Загрузка...
          </div>
        )}

        {completedAchievements.length > 0 && (
          <ProfileAchievementsSection
            achievements={completedAchievements}
            onOpenAchievement={setSelectedAchievement}
            labelStyle={{ margin: '18px 0 6px', padding: '2px 6px' }}
            style={{ margin: 0 }}
          />
        )}

        {isSelf ? (
          <div
            className="btn btn--ghost"
            style={{
              marginTop: 14,
              padding: '14px 0',
              fontSize: 15,
              fontWeight: 600,
              justifyContent: 'center',
            }}
          >
            Это ваш профиль
          </div>
        ) : (
          <>
            {canDuel && (
              <button
                type="button"
                className="btn btn--cta"
                onClick={() => setDuelPickerOpen(true)}
                disabled={hasOpenDuel}
                style={{ marginTop: 14, padding: '14px 0', fontSize: 15, fontWeight: 600 }}
              >
                {hasOpenDuel ? 'Дуэль уже открыта' : 'Вызвать на дуэль'}
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => mutate(sender.userId)}
              disabled={isPending}
              style={{
                marginTop: canDuel ? 8 : 14,
                padding: '14px 0',
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {isPending ? 'Открываем чат…' : 'Написать в личку'}
            </button>
          </>
        )}
        {selectedAchievement !== null && (
          <AchievementDetailsSheet
            achievement={selectedAchievement}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
        {duelPickerOpen && (
          <DuelChallengeModal
            opponentUserId={senderId}
            opponentName={displayName}
            onClose={() => setDuelPickerOpen(false)}
            onCreated={() => {
              setDuelPickerOpen(false);
            }}
          />
        )}
      </div>
    </Sheet>
  );
}
