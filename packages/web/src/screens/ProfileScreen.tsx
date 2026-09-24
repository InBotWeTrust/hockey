import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  ChevronRight,
  CircleDollarSign,
  Medal,
  Star,
  Sunrise,
  Target,
  TrendingUp,
  Trophy,
  Copy,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import {
  fetchMyInventory,
  patchEquipment,
  type InventoryItem,
  type InventoryState,
} from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { CommunityLinks } from '../components/CommunityLinks.js';
import { useAuthStore } from '../auth/authStore.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from './inventoryArtwork.js';
import {
  formatProfileInventoryBadgeAmount,
  formatInventoryResourceAmount,
  formatRecoveryMinutesTotal,
  recoveryMinutesAvailable,
} from './inventoryResourceLabels.js';
import {
  AchievementDetailsSheet,
  FittedOneLineText,
  formatProfileNumber,
  getLevelLabel,
} from './profileSections.js';
import type { ProfileData } from './profileTypes.js';
import {
  highestCompletedLevel,
  summarizeAchievementProgress,
} from '../achievements/progressSummary.js';
import { achievementThumbnailUrl } from '../achievements/artwork.js';
import { lockerRoomBackgroundClass } from './lockerRoomBackground.js';
import { ExperienceRatingModal } from '../profile/ExperienceRatingModal.js';
import type { ExperienceRatingPlayer } from '../api/experienceRating.js';
import { StatRatingModal } from '../profile/StatRatingModal.js';
import type { StatRatingMetric, StatRatingPlayer } from '../api/statRating.js';
import { preloadArtwork, profileArtworkUrls } from '../app/artworkCache.js';
import { MARKSMANSHIP_CONSTRUCTOR_ENABLED } from '../app/devOnlyFeatures.js';
import { fetchReferralSummary, type ReferralSummary } from '../api/referrals.js';

export type TrophySectionKey = keyof NonNullable<ProfileData['trophyDetails']>;

const TROPHY_SECTION_TITLES: Record<TrophySectionKey, string> = {
  regularSeasonWins: 'Победы в регулярке',
  tournamentChampionships: 'Чемпионства',
  tournamentPodiums: 'Призовые места',
  completedChallenges: 'Пройденные челленджи',
};

function formatTrophyDateRange(startsAt: string | null, endsAt: string | null): string {
  const format = (value: string | null): string | null => {
    if (value === null) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString('ru-RU', {
          timeZone: 'UTC',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
  };
  const start = format(startsAt);
  const end = format(endsAt);
  if (start !== null && end !== null) return `${start} — ${end}`;
  return start ?? end ?? 'Дата проведения не указана';
}

function formatChallengeCompletedAt(value: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `Завершён ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} МСК`;
}

function ProfileBalance({
  label,
  value,
  tone,
  icon,
  onClick,
  actionLabel,
}: {
  label: string;
  value: number;
  tone: string;
  icon: JSX.Element;
  onClick?: () => void;
  actionLabel?: string;
}): JSX.Element {
  const content = (
    <>
      <span className="profile-balance__label">{label}</span>
      <span className={`profile-balance__amount profile-balance__amount--${tone}`}>
        {icon}
        <strong className="profile-balance__value" aria-label={`${label}: ${value}`}>
          <FittedOneLineText maxFontSize={18}>{formatProfileNumber(value)}</FittedOneLineText>
        </strong>
      </span>
    </>
  );
  return onClick === undefined ? (
    <div className="profile-balance">{content}</div>
  ) : (
    <button
      type="button"
      className="profile-balance profile-balance--button"
      aria-label={actionLabel ?? label}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function findEquippedItem(
  inventory: InventoryState,
  kind: keyof InventoryState['equipped'],
): InventoryItem | null {
  const selectedId = inventory.equipped[kind];
  if (selectedId === null) return null;
  const group = kind === 'stickItemId' ? 'stick' : kind === 'skatesItemId' ? 'skates' : 'nutrition';
  return (
    inventory.items[group].find(
      (item) => item.id === selectedId || item.instanceId === selectedId,
    ) ?? null
  );
}

function EquipmentPanel({
  inventory,
  onOpen,
  onChoose,
  onOpenRecovery,
}: {
  inventory: InventoryState | undefined;
  onOpen: () => void;
  onChoose: (kind: keyof InventoryState['equipped']) => void;
  onOpenRecovery: () => void;
}): JSX.Element {
  const slots = [
    ['stickItemId', 'Клюшка', 'клюшку', 'Базовая клюшка', 'stick'],
    ['skatesItemId', 'Коньки', 'коньки', 'Базовые коньки', 'skates'],
    ['nutritionItemId', 'Питание', 'питание', 'Базовое питание', 'nutrition'],
  ] as const;
  const recoveryItems = inventory?.items.recovery ?? [];
  const recoveryMinutes = recoveryMinutesAvailable(recoveryItems);
  const recoveryItem = recoveryItems.find((item) => item.chargesAvailable > 0) ?? null;
  const recoveryArtwork = recoveryItem?.imageUrl ?? '/inventory/recovery-30.webp';
  return (
    <section className="profile-equipment-section" aria-label="Инвентарь">
      <button
        type="button"
        className="section-label profile-section-label"
        aria-label="Открыть инвентарь"
        onClick={onOpen}
      >
        Инвентарь
      </button>
      <div className="profile-equipment-panel glass">
        <span className="profile-loadout" aria-label="Выбранная экипировка">
          {slots.map(([kind, label, actionLabel, baseImageAlt, equipmentKind]) => {
            const item = inventory === undefined ? null : findEquippedItem(inventory, kind);
            return (
              <button
                type="button"
                className="profile-loadout-slot"
                aria-label={`Выбрать ${actionLabel}`}
                key={kind}
                onClick={() => onChoose(kind)}
              >
                <span className="profile-loadout-slot__image">
                  <img
                    src={
                      item
                        ? artworkForInventoryItem(item)
                        : placeholderArtworkForKind(equipmentKind)
                    }
                    alt={item?.title ?? baseImageAlt}
                  />
                  {item !== null ? (
                    <strong>
                      <FittedOneLineText maxFontSize={9} minFontSize={5}>
                        {formatProfileInventoryBadgeAmount(
                          item.kind,
                          item.chargesAvailable,
                          item.resourceUnit,
                        )}
                      </FittedOneLineText>
                    </strong>
                  ) : null}
                </span>
                <span className="profile-loadout-slot__kind">{label}</span>
                <span className="profile-loadout-slot__title">{item?.title ?? 'Не выбрано'}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`profile-loadout-slot${recoveryMinutes === 0 ? ' profile-loadout-slot--empty' : ''}`}
            aria-label={`Восстановление: ${formatRecoveryMinutesTotal(recoveryMinutes)}`}
            onClick={onOpenRecovery}
          >
            <span className="profile-loadout-slot__image">
              <img src={recoveryArtwork} alt={recoveryItem?.title ?? 'Наборы для восстановления'} />
              <strong>
                <FittedOneLineText maxFontSize={9} minFontSize={5}>
                  {formatProfileNumber(recoveryMinutes)} мин
                </FittedOneLineText>
              </strong>
            </span>
            <span className="profile-loadout-slot__kind">Восстановление</span>
            <span className="profile-loadout-slot__title">
              {recoveryItem?.title ?? 'Нет в запасе'}
            </span>
          </button>
        </span>
      </div>
    </section>
  );
}

function ReferralPanel({ summary, onOpen }: { summary: ReferralSummary | undefined; onOpen: () => void }): JSX.Element {
  const next = summary?.milestones.find((item) => item.unlockedAt === null) ?? null;
  const inviteUrl = summary ? `${window.location.origin}/invite/${summary.code}` : '';
  const copy = (value: string): void => { void navigator.clipboard.writeText(value); };
  return (
    <section className="profile-referral-section" aria-label="Приглашай друзей">
      <button type="button" className="section-label profile-section-label" aria-label="Открыть приглашённых друзей" onClick={onOpen}>Приглашай друзей</button>
      <div className="profile-referral-panel glass" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
        <span className="profile-referral-panel__artwork">
          <img src="/profile/referral-friends.webp" alt="Два хоккеиста вместе" />
        </span>
        {(summary?.unclaimedRewardsCount ?? 0) > 0 ? (
          <span className="profile-referral-panel__attention attention-dot-pulse" aria-label="Есть награды за приглашения" />
        ) : null}
        <span className="profile-referral-panel__copy">
          <strong>{summary?.totalInvited ?? 0} приглашено</strong>
          {next ? <small>{summary?.qualifiedInvited ?? 0} из {next.qualifiedReferrals} до {next.rewardStars} звёзд</small> : null}
          <span className="profile-referral-panel__progress"><i style={{ width: `${next ? Math.min(100, ((summary?.qualifiedInvited ?? 0) / next.qualifiedReferrals) * 100) : 100}%` }} /></span>
          <span className="profile-referral-copy-row">
            <span className="profile-referral-copy-row__value"><small>Ссылка для приглашения</small><strong>{inviteUrl || 'Загружаем…'}</strong></span>
            <button type="button" className="icon-btn" aria-label="Скопировать ссылку" disabled={!inviteUrl} onClick={(event) => { event.stopPropagation(); copy(inviteUrl); }}><Copy size={15} /></button>
          </span>
          <span className="profile-referral-copy-row">
            <span className="profile-referral-copy-row__value"><small>Код приглашения</small><strong>{summary?.code ?? '—'}</strong></span>
            <button type="button" className="icon-btn" aria-label="Скопировать код" disabled={!summary} onClick={(event) => { event.stopPropagation(); if (summary) copy(summary.code); }}><Copy size={15} /></button>
          </span>
        </span>
        <ChevronRight size={20} />
      </div>
    </section>
  );
}

function formatRecoveryDuration(minutes: number): string {
  if (minutes === 60) return '1 час';
  return `${minutes} минут`;
}

function RecoveryStockModal({
  inventory,
  onClose,
  onOpenShop,
}: {
  inventory: InventoryState | undefined;
  onClose: () => void;
  onOpenShop: () => void;
}): JSX.Element {
  const items = (inventory?.items.recovery ?? []).filter((item) => item.chargesAvailable > 0);
  return (
    <AccessibleModal
      title="Наборы для восстановления"
      ariaLabel="Наборы для восстановления"
      onRequestClose={onClose}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      {items.length > 0 ? (
        <div className="profile-picker-list">
          {items.map((item) => (
            <article className="profile-picker-item profile-recovery-stock-item" key={item.id}>
              <img src={item.imageUrl ?? '/inventory/recovery-30.webp'} alt="" />
              <span>
                <strong>{item.title}</strong>
                <small>Снимает {formatRecoveryDuration(item.effectRecoveryMinutes ?? 0)}</small>
                <small>В запасе: {formatProfileNumber(item.chargesAvailable)}</small>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className="modal-copy">Наборов восстановления пока нет в запасе.</p>
      )}
      <div className="modal-actions">
        <button type="button" className="modal-primary btn btn--cta" onClick={onOpenShop}>
          Перейти в магазин
        </button>
      </div>
    </AccessibleModal>
  );
}

function CareerPanel({
  profile,
  onOpen,
  onChoose,
}: {
  profile: ProfileData;
  onOpen: () => void;
  onChoose: (achievement: ProfileData['achievements'][number]) => void;
}): JSX.Element {
  const summary = summarizeAchievementProgress(profile.achievements);
  const earned = profile.achievements
    .filter((achievement) => achievement.isUnlocked || highestCompletedLevel(achievement) > 0)
    .sort((left, right) => {
      const leftTime = left.completedAt ? Date.parse(left.completedAt) : Number.NaN;
      const rightTime = right.completedAt ? Date.parse(right.completedAt) : Number.NaN;
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
      if (Number.isFinite(leftTime)) return -1;
      if (Number.isFinite(rightTime)) return 1;
      return 0;
    });
  return (
    <section className="profile-career-section" aria-label="Задания">
      <button
        type="button"
        className="section-label profile-section-label"
        aria-label="Открыть задания"
        onClick={onOpen}
      >
        Задания · {summary.completed}/{summary.total}, уровни · {summary.levels.completed}/{summary.levels.total}
      </button>
      <div className="profile-career-panel glass">
        {earned.length > 0 ? (
          <span className="profile-career-list profile-career-list--scroll">
            {earned.map((achievement) => (
              <button
                type="button"
                className="profile-career-award"
                aria-label={`Открыть задание ${achievement.title}`}
                key={achievement.id}
                onClick={() => onChoose(achievement)}
              >
                <span className="profile-career-award__image">
                  <img src={achievementThumbnailUrl(achievement.photoUrl)} alt="" />
                  {achievement.stage && highestCompletedLevel(achievement) > 0 && (
                    <span className="profile-career-award__level">
                      Ур. {highestCompletedLevel(achievement)}/{achievement.stage.total}
                    </span>
                  )}
                </span>
                <span
                  className={`profile-achievement-title${
                    achievement.id === 'training-monster'
                      ? ' profile-achievement-title--compact'
                      : ''
                  }`}
                >
                  {achievement.title}
                </span>
              </button>
            ))}
          </span>
        ) : (
          <span className="profile-career-empty-copy">Первая награда ещё впереди</span>
        )}
      </div>
    </section>
  );
}

function EquipmentPickerModal({
  kind,
  inventory,
  onClose,
  onSelect,
}: {
  kind: keyof InventoryState['equipped'];
  inventory: InventoryState;
  onClose: () => void;
  onSelect: (item: InventoryItem | null) => void;
}): JSX.Element {
  const label = kind === 'stickItemId' ? 'клюшку' : kind === 'skatesItemId' ? 'коньки' : 'питание';
  const group = kind === 'stickItemId' ? 'stick' : kind === 'skatesItemId' ? 'skates' : 'nutrition';
  const defaultTitle =
    group === 'stick' ? 'Обычная клюшка' : group === 'skates' ? 'Обычные коньки' : 'Без питания';
  const selected = inventory.equipped[kind];
  const availableItems = inventory.items[group].filter((item) => item.chargesAvailable > 0);
  return (
    <AccessibleModal
      title={`Выбрать ${label}`}
      ariaLabel={`Выбрать ${label}`}
      onRequestClose={onClose}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      <div className="profile-picker-list">
        <button
          type="button"
          aria-label={`Выбрать ${defaultTitle}`}
          className={`profile-picker-item${selected === null ? ' profile-picker-item--selected' : ''}`}
          onClick={() => onSelect(null)}
        >
          <img src={placeholderArtworkForKind(group)} alt="" />
          <span>
            <strong>{defaultTitle}</strong>
            <small>Базовый вариант</small>
          </span>
        </button>
        {availableItems.map((item) => (
          <button
            type="button"
            className={`profile-picker-item${selected === item.id || selected === item.instanceId ? ' profile-picker-item--selected' : ''}`}
            key={item.id}
            onClick={() => onSelect(item)}
          >
            <img src={artworkForInventoryItem(item)} alt="" />
            <span>
              <strong>{item.title}</strong>
              <small>
                Осталось:{' '}
                {formatInventoryResourceAmount(item.kind, item.chargesAvailable, item.resourceUnit)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </AccessibleModal>
  );
}

export function TrophyHistoryModal({
  section,
  details,
  onClose,
}: {
  section: TrophySectionKey;
  details: NonNullable<ProfileData['trophyDetails']>;
  onClose: () => void;
}): JSX.Element {
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(null);
  const title = TROPHY_SECTION_TITLES[section];
  const isChallenge = section === 'completedChallenges';
  const challengeItems = details.completedChallenges;
  const tournamentItems = section === 'completedChallenges' ? [] : details[section];
  const itemCount = isChallenge ? challengeItems.length : tournamentItems.length;
  return (
    <AccessibleModal
      title={`${title} (${itemCount})`}
      ariaLabel={`${title} (${itemCount})`}
      onRequestClose={onClose}
      cardClassName="profile-trophy-history-modal"
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={16} />
        </button>
      }
    >
      <div
        className={`profile-trophy-history${isChallenge ? ' profile-trophy-history--challenges' : ''}`}
      >
        {isChallenge
          ? challengeItems.map((item) => (
              <article className="profile-trophy-history__challenge" key={item.id}>
                <button
                  type="button"
                  className="profile-trophy-history__challenge-toggle"
                  aria-label={formatChallengeCompletedAt(item.endsAt)}
                  aria-expanded={expandedChallengeId === item.id}
                  onClick={() =>
                    setExpandedChallengeId((current) => (current === item.id ? null : item.id))
                  }
                >
                  <span className="profile-trophy-history__challenge-summary">
                    {formatChallengeCompletedAt(item.endsAt)}
                  </span>
                  <ChevronRight className="profile-trophy-history__challenge-chevron" aria-hidden="true" />
                </button>
                {expandedChallengeId === item.id ? (
                  <div className="profile-trophy-history__challenge-details">
                    {item.title !== '' ? <strong>{item.title}</strong> : null}
                    <ul className="profile-trophy-history__challenge-tasks">
                      {item.tasks.map((task, index) => (
                        <li key={`${task.title}:${index}`}>
                          <span>{task.title}</span>
                          <strong>
                            {formatProfileNumber(task.progress)} / {formatProfileNumber(task.target)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))
          : tournamentItems.map((item) => (
              <article className="profile-trophy-history__tournament" key={item.id}>
                <img src={item.imageUrl ?? '/modes/tournaments.webp'} alt={item.title} />
                <span className="profile-trophy-history__tournament-copy">
                  <strong>{item.title}</strong>
                  <small>{formatTrophyDateRange(item.startsAt, item.endsAt)}</small>
                  <em>{item.result}</em>
                </span>
              </article>
            ))}
      </div>
    </AccessibleModal>
  );
}

function TrophyShowcase({
  profile,
  onOpen,
}: {
  profile: ProfileData;
  onOpen: (section: TrophySectionKey) => void;
}): JSX.Element {
  const summary = profile.trophySummary ?? {
    regularSeasonWins: 0,
    tournamentChampionships: 0,
    tournamentPodiums: 0,
    completedChallenges: 0,
  };
  const items = [
    ['regularSeasonWins', 'Победы в регулярке', summary.regularSeasonWins, Trophy],
    ['tournamentChampionships', 'Чемпионства', summary.tournamentChampionships, Award],
    ['tournamentPodiums', 'Призовые места', summary.tournamentPodiums, Medal],
    ['completedChallenges', 'Пройденные челленджи', summary.completedChallenges, Target],
  ] as const;
  return (
    <section className="profile-trophy-showcase" aria-label="Витрина наград">
      {items.map(([key, label, value, Icon]) => {
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
            key={key}
            onClick={() => onOpen(key)}
          >
            {content}
          </button>
        ) : (
          <div
            className="profile-trophy-showcase__item profile-trophy-showcase__item--empty"
            key={key}
          >
            {content}
          </div>
        );
      })}
    </section>
  );
}

function SportingMetrics({
  profile,
  onOpenRating,
}: {
  profile: ProfileData;
  onOpenRating: (metric: StatRatingMetric) => void;
}): JSX.Element {
  const registeredDate = new Date(profile.registeredAt);
  const registeredLabel = Number.isNaN(registeredDate.getTime())
    ? '—'
    : registeredDate.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
  const items: Array<{ value: ReactNode; label: string; metric?: StatRatingMetric }> = [
    { value: formatProfileNumber(profile.stats.goals), label: 'Шайбы', metric: 'goals' },
    {
      value: `${profile.stats.accuracy.toLocaleString('ru-RU', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`,
      label: 'Точность',
      metric: 'accuracy',
    },
    {
      value: (
        <>
          {formatProfileNumber(profile.stats.playStreakDays)}{' '}
          <span className="profile-streak-record">
            ({formatProfileNumber(profile.stats.bestPlayStreakDays ?? profile.stats.playStreakDays)}
            )
          </span>
        </>
      ),
      label: 'Дней подряд',
      metric: 'streak',
    },
    {
      value:
        registeredLabel === '—' ? (
          registeredLabel
        ) : (
          <span className="profile-registration-date">
            <span className="profile-registration-date__prefix">с</span>
            {registeredLabel}
          </span>
        ),
      label: 'В игре',
    },
  ];
  return (
    <div className="profile-sporting-metrics" aria-label="Главные показатели">
      {items.map(({ value, label, metric }) => {
        const content = (
          <>
            <strong>
              <FittedOneLineText maxFontSize={17}>{value}</FittedOneLineText>
            </strong>
            <span>{label}</span>
          </>
        );
        return metric !== undefined ? (
          <button
            type="button"
            className="profile-sporting-metrics__item profile-sporting-metrics__item--button"
            key={label}
            aria-label={`Открыть рейтинг: ${label}`}
            onClick={() => onOpenRating(metric)}
          >
            {content}
          </button>
        ) : (
          <div className="profile-sporting-metrics__item" key={label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ProfileLoadError({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <main className="screen profile-screen profile-screen--status">
      <section className="profile-error-state" role="alert">
        <h1>Не удалось загрузить профиль</h1>
        <p>Баланс и прогресс не показаны, чтобы не выдать ошибку за реальные данные.</p>
        <button type="button" className="btn btn--cta" onClick={onRetry}>
          Повторить
        </button>
      </section>
    </main>
  );
}

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pickerKind, setPickerKind] = useState<keyof InventoryState['equipped'] | null>(null);
  const [recoveryStockOpen, setRecoveryStockOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<
    ProfileData['achievements'][number] | null
  >(null);
  const [selectedTrophySection, setSelectedTrophySection] = useState<TrophySectionKey | null>(null);
  const [experienceRatingOpen, setExperienceRatingOpen] = useState(false);
  const [statRatingMetric, setStatRatingMetric] = useState<StatRatingMetric | null>(null);
  const [earlyPlayerStatusOpen, setEarlyPlayerStatusOpen] = useState(false);
  const updateUser = useAuthStore((state) => state.updateUser);
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const referralQuery = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
  const synchronizeProfileStats = useCallback(
    (player: StatRatingPlayer): void => {
      queryClient.setQueryData<ProfileData>(['profile'], (current) => {
        if (current === undefined || current.id !== player.userId) return current;
        return {
          ...current,
          stats: {
            ...current.stats,
            goals: player.goals,
            shots: player.shots,
            accuracy: Math.round(player.accuracy * 10) / 10,
            playStreakDays: player.currentStreakDays,
            bestPlayStreakDays: player.recordStreakDays,
          },
        };
      });
    },
    [queryClient],
  );
  const synchronizeProfileExperience = useCallback(
    (player: ExperienceRatingPlayer): void => {
      queryClient.setQueryData<ProfileData>(['profile'], (current) => {
        if (current === undefined || current.id !== player.userId) return current;
        return { ...current, experienceBalance: player.experience };
      });
    },
    [queryClient],
  );
  const equipmentMutation = useMutation({
    mutationFn: (patch: Partial<InventoryState['equipped']>) => patchEquipment(patch),
    onSuccess: (inventory) => {
      queryClient.setQueryData(['inventory', 'me'], inventory);
      setPickerKind(null);
    },
  });
  useEffect(() => {
    const profile = profileQuery.data;
    if (profile === undefined) return;
    updateUser({
      displayName: profile.displayName,
      grip: profile.grip,
      ...(profile.avatarUrl !== undefined ? { avatarUrl: profile.avatarUrl } : {}),
      ...(profile.role !== undefined ? { role: profile.role } : {}),
      ...(profile.displaySource !== undefined ? { displaySource: profile.displaySource } : {}),
      ...(profile.linkedProviders !== undefined
        ? { linkedProviders: profile.linkedProviders }
        : {}),
      ...(profile.unclaimedReferralRewardsCount !== undefined
        ? { unclaimedReferralRewardsCount: profile.unclaimedReferralRewardsCount }
        : {}),
    });
  }, [profileQuery.data, updateUser]);
  useEffect(() => {
    const profile = profileQuery.data;
    const inventory = inventoryQuery.data;
    if (profile === undefined || inventory === undefined) return;
    preloadArtwork(profileArtworkUrls(profile, inventory));
  }, [inventoryQuery.data, profileQuery.data]);

  if (profileQuery.isLoading) {
    return (
      <main className="screen profile-screen profile-screen--status" aria-busy="true">
        <p>Загружаем профиль…</p>
      </main>
    );
  }

  if (profileQuery.isError || profileQuery.data === undefined) {
    return <ProfileLoadError onRetry={() => void profileQuery.refetch()} />;
  }

  const profile = profileQuery.data;
  const { currencyBalance, starBalance, experienceBalance } = profile;
  if (
    typeof currencyBalance !== 'number' ||
    typeof starBalance !== 'number' ||
    typeof experienceBalance !== 'number' ||
    !Number.isFinite(currencyBalance) ||
    !Number.isFinite(starBalance) ||
    !Number.isFinite(experienceBalance)
  ) {
    return <ProfileLoadError onRetry={() => void profileQuery.refetch()} />;
  }
  const initial = profile.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <main
      className={`screen profile-screen profile-screen--locker-bg ${lockerRoomBackgroundClass(profile.competitionLevel)}`}
    >
      <section className="profile-passport glass" aria-label="Спортивный паспорт">
        <div className="profile-passport__top">
          <div className="profile-identity__main">
            {MARKSMANSHIP_CONSTRUCTOR_ENABLED ? (
              <button
                type="button"
                className="profile-identity__avatar"
                aria-label="Конструктор меткости"
                onClick={() => navigate('/profile/marksmanship-constructor')}
              >
                {profile.avatarUrl !== undefined && profile.avatarUrl !== null ? (
                  <img src={profile.avatarUrl} alt="" />
                ) : (
                  <span>{initial}</span>
                )}
              </button>
            ) : (
              <div className="profile-identity__avatar">
                {profile.avatarUrl !== undefined && profile.avatarUrl !== null ? (
                  <img src={profile.avatarUrl} alt="" />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
            )}
            <div className="profile-identity__copy">
              <span className="profile-identity__name">{profile.displayName}</span>
              <span className="profile-identity__level">
                {getLevelLabel(profile.competitionLevel)}
              </span>
            </div>
            <button
              type="button"
              className="profile-early-player-badge"
              aria-label="Статус: У истоков"
              onClick={() => setEarlyPlayerStatusOpen(true)}
            >
              <Sunrise
                data-testid="profile-early-player-icon"
                aria-hidden="true"
                size={21}
                strokeWidth={1.8}
              />
            </button>
          </div>
          <div className="profile-balances" aria-label="Баланс игрока">
            <ProfileBalance
              label="Монеты"
              value={currencyBalance}
              tone="coins"
              icon={
                <CircleDollarSign data-testid="profile-balance-icon-coins" aria-hidden="true" />
              }
            />
            <ProfileBalance
              label="Звёзды"
              value={starBalance}
              tone="stars"
              icon={
                <Star
                  data-testid="profile-balance-icon-stars"
                  aria-hidden="true"
                  fill="currentColor"
                />
              }
            />
            <ProfileBalance
              label="Опыт"
              value={experienceBalance}
              tone="experience"
              icon={<TrendingUp data-testid="profile-balance-icon-experience" aria-hidden="true" />}
              actionLabel="Открыть рейтинг по опыту"
              onClick={() => setExperienceRatingOpen(true)}
            />
          </div>
        </div>
        <SportingMetrics profile={profile} onOpenRating={setStatRatingMetric} />
        <TrophyShowcase profile={profile} onOpen={setSelectedTrophySection} />
      </section>

      {experienceRatingOpen ? (
        <ExperienceRatingModal
          currentUserId={profile.id}
          onCurrentUser={synchronizeProfileExperience}
          onClose={() => setExperienceRatingOpen(false)}
        />
      ) : null}
      {statRatingMetric !== null ? (
        <StatRatingModal
          metric={statRatingMetric}
          currentUserId={profile.id}
          onCurrentUser={synchronizeProfileStats}
          onClose={() => setStatRatingMetric(null)}
        />
      ) : null}
      {earlyPlayerStatusOpen ? (
        <AccessibleModal
          title="Ранний игрок"
          ariaLabel="Ранний игрок"
          onRequestClose={() => setEarlyPlayerStatusOpen(false)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть"
              onClick={() => setEarlyPlayerStatusOpen(false)}
            >
              <X size={15} />
            </button>
          }
        >
          <div className="profile-early-player-modal__badge" aria-hidden="true">
            <img src="/profile/early-player-badge.png" alt="" />
          </div>
          <p className="modal-copy">
            Вы присоединились к игре «Ультимейт Хоккей» на старте проекта.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-primary btn btn--cta"
              onClick={() => setEarlyPlayerStatusOpen(false)}
            >
              Понятно
            </button>
          </div>
        </AccessibleModal>
      ) : null}

      <section className="profile-sports-data" aria-label="Спортивные данные игрока">
        <ReferralPanel summary={referralQuery.data} onOpen={() => navigate('/referrals')} />
        <EquipmentPanel
          inventory={inventoryQuery.data}
          onOpen={() => navigate('/profile/equipment')}
          onChoose={setPickerKind}
          onOpenRecovery={() => setRecoveryStockOpen(true)}
        />
        <CareerPanel
          profile={profile}
          onOpen={() => navigate('/profile/achievements')}
          onChoose={setSelectedAchievement}
        />
        <CommunityLinks />
      </section>
      {pickerKind !== null && inventoryQuery.data !== undefined ? (
        <EquipmentPickerModal
          kind={pickerKind}
          inventory={inventoryQuery.data}
          onClose={() => setPickerKind(null)}
          onSelect={(item) =>
            equipmentMutation.mutate({ [pickerKind]: item?.instanceId ?? item?.id ?? null })
          }
        />
      ) : null}
      {recoveryStockOpen ? (
        <RecoveryStockModal
          inventory={inventoryQuery.data}
          onClose={() => setRecoveryStockOpen(false)}
          onOpenShop={() => navigate('/inventory')}
        />
      ) : null}
      {selectedAchievement !== null ? (
        <AchievementDetailsSheet
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
        />
      ) : null}
      {selectedTrophySection !== null && profile.trophyDetails !== undefined ? (
        <TrophyHistoryModal
          section={selectedTrophySection}
          details={profile.trophyDetails}
          onClose={() => setSelectedTrophySection(null)}
        />
      ) : null}
    </main>
  );
}
