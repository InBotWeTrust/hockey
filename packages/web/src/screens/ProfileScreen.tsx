import { type ReactNode, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  ChevronRight,
  CircleDollarSign,
  Medal,
  Settings,
  Star,
  Target,
  TrendingUp,
  Trophy,
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
import { placeholderArtworkForKind } from './inventoryArtwork.js';
import {
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
import { lockerRoomBackgroundClass } from './lockerRoomBackground.js';

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

function ProfileBalance({
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
          <FittedOneLineText maxFontSize={18}>{formatProfileNumber(value)}</FittedOneLineText>
        </strong>
      </span>
    </div>
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
  const recoveryArtwork =
    recoveryItems.find((item) => item.chargesAvailable > 0)?.imageUrl ??
    '/inventory/recovery-30.webp';
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
                    src={item?.imageUrl ?? placeholderArtworkForKind(equipmentKind)}
                    alt={item?.title ?? baseImageAlt}
                  />
                  {item !== null ? (
                    <strong>
                      <FittedOneLineText maxFontSize={9} minFontSize={5}>
                        {formatProfileNumber(item.chargesAvailable)}
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
              <img src={recoveryArtwork} alt="Наборы для восстановления" />
              <strong>
                <FittedOneLineText maxFontSize={9} minFontSize={5}>
                  {formatProfileNumber(recoveryMinutes)}
                </FittedOneLineText>
              </strong>
            </span>
            <span className="profile-loadout-slot__kind">Восстановление</span>
            <span className="profile-loadout-slot__title">
              {recoveryMinutes > 0 ? 'Минут' : 'Нет в запасе'}
            </span>
          </button>
        </span>
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
  const earned = profile.achievements.filter((achievement) => achievement.isUnlocked);
  return (
    <section className="profile-career-section" aria-label="Награды и достижения">
      <button
        type="button"
        className="section-label profile-section-label"
        aria-label="Открыть карьеру и награды"
        onClick={onOpen}
      >
        Награды и достижения ({earned.length})
      </button>
      <div className="profile-career-panel glass">
        {earned.length > 0 ? (
          <span className="profile-career-list profile-career-list--scroll">
            {earned.map((achievement) => (
              <button
                type="button"
                className="profile-career-award"
                aria-label={`Открыть достижение ${achievement.title}`}
                key={achievement.id}
                onClick={() => onChoose(achievement)}
              >
                <img src={achievement.photoUrl} alt="" />
                <span>{achievement.title}</span>
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
            {item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
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
      cardStyle={{
        width: 'min(560px, calc(100vw - 32px))',
        maxHeight: 'calc(100dvh - 32px - var(--app-safe-top) - var(--app-safe-bottom))',
        overflowY: 'auto',
      }}
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
                <strong>{item.title}</strong>
                <span>{formatTrophyDateRange(item.startsAt, item.endsAt)}</span>
                <p>{item.tasks.join(' · ')}</p>
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

function SportingMetrics({ profile }: { profile: ProfileData }): JSX.Element {
  const registeredDate = new Date(profile.registeredAt);
  const registeredLabel = Number.isNaN(registeredDate.getTime())
    ? '—'
    : registeredDate.toLocaleDateString('ru-RU', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
  const items: Array<{ value: ReactNode; label: string }> = [
    { value: formatProfileNumber(profile.stats.goals), label: 'Шайбы' },
    { value: `${formatProfileNumber(profile.stats.accuracy)}%`, label: 'Точность' },
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
      {items.map(({ value, label }) => (
        <div className="profile-sporting-metrics__item" key={label}>
          <strong>
            <FittedOneLineText maxFontSize={17}>{value}</FittedOneLineText>
          </strong>
          <span>{label}</span>
        </div>
      ))}
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
  const updateUser = useAuthStore((state) => state.updateUser);
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
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
    });
  }, [profileQuery.data, updateUser]);

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
            <div className="profile-identity__avatar">
              {profile.avatarUrl !== undefined && profile.avatarUrl !== null ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="profile-identity__copy">
              <span className="profile-identity__name">{profile.displayName}</span>
              <span className="profile-identity__level">
                {getLevelLabel(profile.competitionLevel)}
              </span>
            </div>
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
            />
          </div>
        </div>
        <SportingMetrics profile={profile} />
        <TrophyShowcase profile={profile} onOpen={setSelectedTrophySection} />
      </section>

      <section className="profile-sports-data" aria-label="Спортивные данные игрока">
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
        <section className="profile-settings-section" aria-label="Настройки">
          <span className="section-label profile-section-label">Настройки</span>
          <div className="profile-utility-grid">
            <button
              type="button"
              className="profile-utility-card glass"
              aria-label="Настройки"
              onClick={() => navigate('/profile/settings')}
            >
              <span className="profile-utility-card__visual profile-utility-card__visual--icon">
                <Settings aria-hidden="true" />
              </span>
              <span className="profile-utility-card__copy">
                <strong className="profile-settings-card__title">Профиль и уведомления</strong>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>
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
