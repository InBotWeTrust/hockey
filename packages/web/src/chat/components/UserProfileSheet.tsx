import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Award, Medal, Target, TrendingUp, Trophy, X } from 'lucide-react';
import {
  fetchUserProfile,
  findOrCreateDM,
  type UserPickerItem,
  type UserPublicProfileDTO,
} from '../api.js';
import {
  checkAmateurDuelChallengeAvailability,
  fetchAmateurMatches,
} from '../../api/amateurDuel.js';
import { chatKeys, userKeys } from '../../lib/queryKeys.js';
import { UserAvatar } from './UserAvatar.js';
import type { ProfileAchievement } from '../../screens/profileTypes.js';
import {
  AchievementDetailsSheet,
  FittedOneLineText,
  formatProfileNumber,
  getLevelLabel,
  ProfileAchievementsSection,
} from '../../screens/profileSections.js';
import { useAuthStore } from '../../auth/authStore.js';
import { DuelChallengeModal, hasOpenDuelWithUser } from './DuelChallengeModal.js';
import { Sheet } from '../../components/Sheet.js';
import { TrophyHistoryModal, type TrophySectionKey } from '../../screens/ProfileScreen.js';
import { CommunityLinks } from '../../components/CommunityLinks.js';
import { AppToast } from '../../components/AppToast.js';

interface UserProfileSheetProps {
  sender: UserPickerItem | null;
  onClose: () => void;
  hideMessageAction?: boolean;
}

function PublicExperienceBadge({ experience }: { experience: number }): JSX.Element {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const formattedExperience = formatProfileNumber(experience);

  useLayoutEffect(() => {
    const badge = badgeRef.current;
    const value = valueRef.current;
    const icon = iconRef.current;
    if (!badge || !value || !icon) return;

    const fit = (): void => {
      value.style.fontSize = '12px';
      icon.style.width = '13px';
      icon.style.height = '13px';

      const avatarWidth = badge.parentElement?.clientWidth ?? 0;
      const maxWidth = avatarWidth * 1.15;
      const naturalWidth = badge.scrollWidth;
      if (maxWidth === 0 || naturalWidth <= maxWidth) return;

      const scale = Math.max(0.45, maxWidth / naturalWidth);
      value.style.fontSize = `${12 * scale}px`;
      icon.style.width = `${13 * scale}px`;
      icon.style.height = `${13 * scale}px`;
    };

    fit();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(badge.parentElement ?? badge);
    return () => observer?.disconnect();
  }, [formattedExperience]);

  return (
    <span className="public-profile-experience" ref={badgeRef} aria-label={`Опыт: ${experience}`}>
      <TrendingUp aria-hidden="true" ref={iconRef} />
      <span className="public-profile-experience__value" ref={valueRef}>
        {formattedExperience}
      </span>
    </span>
  );
}

function PublicSportingPassport({
  profile,
  displayName,
  avatarUrl,
  onOpenTrophy,
}: {
  profile: UserPublicProfileDTO;
  displayName: string;
  avatarUrl: string | null;
  onOpenTrophy: (section: TrophySectionKey) => void;
}): JSX.Element {
  const registeredDate = new Date(profile.createdAt);
  const registeredLabel = Number.isNaN(registeredDate.getTime())
    ? '—'
    : registeredDate.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
  const trophySummary = profile.trophySummary ?? {
    regularSeasonWins: 0,
    tournamentChampionships: 0,
    tournamentPodiums: 0,
    completedChallenges: 0,
  };
  const trophies = [
    ['regularSeasonWins', 'Победы в регулярке', trophySummary.regularSeasonWins, Trophy],
    ['tournamentChampionships', 'Чемпионства', trophySummary.tournamentChampionships, Award],
    ['tournamentPodiums', 'Призовые места', trophySummary.tournamentPodiums, Medal],
    ['completedChallenges', 'Пройденные челленджи', trophySummary.completedChallenges, Target],
  ] as const;

  return (
    <section
      className="profile-passport public-profile-passport"
      aria-label="Публичный спортивный паспорт"
    >
      <div className="profile-passport__top">
        <div className="profile-identity__main public-profile-identity">
          <div className="public-profile-avatar">
            <UserAvatar avatarUrl={avatarUrl} name={displayName} size={80} fontSize={30} />
            <PublicExperienceBadge experience={profile.experienceBalance ?? 0} />
          </div>
          <div className="profile-identity__copy">
            <span className="profile-identity__name public-profile-identity__name">
              {displayName}
            </span>
            <span className="profile-identity__level">
              {getLevelLabel(profile.competitionLevel)}
            </span>
          </div>
        </div>
      </div>
      <div className="profile-sporting-metrics" aria-label="Главные показатели">
        <div className="profile-sporting-metrics__item">
          <strong>{formatProfileNumber(profile.stats.goals)}</strong>
          <span>Шайбы</span>
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
                <span className="profile-registration-date__prefix">с</span>
                {registeredLabel}
              </span>
            )}
          </strong>
          <span>В игре</span>
        </div>
      </div>
      <section className="profile-trophy-showcase" aria-label="Витрина наград">
        {trophies.map(([section, label, value, Icon]) => {
          const content = (
            <>
              <Icon aria-hidden="true" />
              <strong>
                <FittedOneLineText className="profile-trophy-showcase__number" maxFontSize={18}>
                  {formatProfileNumber(value)}
                </FittedOneLineText>
              </strong>
              <span>{label}</span>
            </>
          );
          return value > 0 ? (
            <button
              type="button"
              className="profile-trophy-showcase__item"
              key={section}
              onClick={() => onOpenTrophy(section)}
            >
              {content}
            </button>
          ) : (
            <div
              className="profile-trophy-showcase__item profile-trophy-showcase__item--empty"
              key={section}
            >
              {content}
            </div>
          );
        })}
      </section>
    </section>
  );
}

export function UserProfileSheet({
  sender,
  onClose,
  hideMessageAction = false,
}: UserProfileSheetProps): JSX.Element | null {
  if (!sender) return null;
  if (sender.accountKind === 'official') {
    return (
      <OfficialAccountSheet
        sender={sender}
        onClose={onClose}
        hideMessageAction={hideMessageAction}
      />
    );
  }
  return <UserProfileSheetContent key={sender.userId} sender={sender} onClose={onClose} />;
}

function OfficialAccountSheet({
  sender,
  onClose,
  hideMessageAction,
}: {
  sender: UserPickerItem;
  onClose: () => void;
  hideMessageAction: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => findOrCreateDM(sender.userId),
    onSuccess: ({ chatId, created }) => {
      if (created) void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      navigate(`/chat/${chatId}`);
      onClose();
    },
  });

  return (
    <Sheet
      open
      title="Официальный аккаунт"
      onRequestClose={onClose}
      maxHeight="94dvh"
      grabberPlacement="top"
      backdropTestId="profile-sheet-backdrop"
      headerAction={
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <X size={14} />
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          className="official-account-hero"
          data-testid="official-account-hero"
          style={{ backgroundImage: 'url("/icons/official-account-cover.webp")' }}
        >
          <div className="official-account-hero__caption">
            <h3>{sender.displayName}</h3>
            <div>Новости игры, обновления и поддержка</div>
          </div>
        </div>
        <CommunityLinks />
        {!hideMessageAction && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => mutate()}
            disabled={isPending}
          >
            {isPending ? 'Открываем чат…' : 'Написать в личку'}
          </button>
        )}
      </div>
    </Sheet>
  );
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
  const [selectedTrophy, setSelectedTrophy] = useState<TrophySectionKey | null>(null);
  const [duelPickerOpen, setDuelPickerOpen] = useState(false);
  const [duelToast, setDuelToast] = useState<string | null>(null);

  const challengeAvailability = useMutation({
    mutationFn: () => checkAmateurDuelChallengeAvailability(senderId),
    onSuccess: () => setDuelPickerOpen(true),
    onError: (error) => {
      setDuelToast(error instanceof Error ? error.message : 'Не удалось проверить доступность дуэли');
    },
  });

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
            onOpenTrophy={setSelectedTrophy}
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
                onClick={() => challengeAvailability.mutate()}
                disabled={hasOpenDuel || challengeAvailability.isPending}
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
        {selectedTrophy !== null && profile?.trophyDetails !== undefined && (
          <TrophyHistoryModal
            section={selectedTrophy}
            details={profile.trophyDetails}
            onClose={() => setSelectedTrophy(null)}
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
            onBlocked={setDuelToast}
          />
        )}
        {duelToast !== null && (
          <AppToast message={duelToast} onDismiss={() => setDuelToast(null)} />
        )}
      </div>
    </Sheet>
  );
}
