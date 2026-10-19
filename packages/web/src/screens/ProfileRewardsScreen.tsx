import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch.js';
import { DistrictPageHeader } from '../components/DistrictPageHeader.js';
import { TrophyShowcase, TrophyHistoryModal, type TrophySectionKey } from './ProfileScreen.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { X } from 'lucide-react';
import type { ProfileAchievement, ProfileData } from './profileTypes.js';
import './profile-rewards.css';

export function earnedHomeAchievements(achievements: readonly ProfileAchievement[]) {
  return achievements.filter(
    (achievement) =>
      achievement.status === 'claimed' ||
      !!achievement.claimedAt ||
      (achievement.stage?.history.length ?? 0) > 0,
  );
}

export function ProfileRewardsScreen(): JSX.Element {
  const query = useQuery<ProfileData>({ queryKey: ['profile'], queryFn: () => apiFetch('/me') });
  const [achievement, setAchievement] = useState<ProfileAchievement | null>(null);
  const [section, setSection] = useState<TrophySectionKey | null>(null);
  const profile = query.data;
  const earned = earnedHomeAchievements(profile?.achievements ?? []);
  return (
    <main className="screen profile-detail-screen profile-rewards-screen">
      <DistrictPageHeader title="Награды" />
      {query.isLoading ? (
        <p role="status">Загружаем награды…</p>
      ) : query.isError ? (
        <section className="glass" role="alert">
          <p>Не удалось загрузить награды.</p>
          <button className="btn btn--cta" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </section>
      ) : (
        profile && (
          <>
            {!earned.length && (
              <section className="glass profile-rewards-empty">
                <h2>Здесь будут твои награды</h2>
                <p>Полученные достижения появятся в этом списке.</p>
              </section>
            )}
            <TrophyShowcase profile={profile} onOpen={setSection} />
            <h2 className="section-label section-label--page">
              Полученные достижения · {earned.length}
            </h2>
            <div className="profile-rewards-list">
              {earned.map((award) => (
                <button
                  className="glass profile-rewards-item"
                  key={award.id}
                  onClick={() => setAchievement(award)}
                >
                  <img src={award.photoUrl} alt="" />
                  <span>
                    <strong>{award.title}</strong>
                    <small>
                      {award.stage?.history.slice().sort((a, b) => b.stageNumber - a.stageNumber)[0]
                        ?.requirement ?? award.requirement}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )
      )}
      {achievement && (
        <AccessibleModal
          title={achievement.title}
          onRequestClose={() => setAchievement(null)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть"
              onClick={() => setAchievement(null)}
            >
              <X size={16} />
            </button>
          }
        >
          <img className="profile-earned-award-image" src={achievement.photoUrl} alt="" />
          <p className="modal-copy">{achievement.description}</p>
          {achievement.stage?.history.length ? (
            <ol className="profile-earned-award-history">
              {achievement.stage.history.map((entry) => (
                <li key={entry.stageNumber}>
                  <strong>Уровень {entry.stageNumber}</strong>
                  <p>{entry.requirement}</p>
                  <small>{new Date(entry.claimedAt).toLocaleDateString('ru-RU')}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="modal-copy">{achievement.requirement}</p>
          )}
        </AccessibleModal>
      )}
      {section && profile?.trophyDetails && (
        <TrophyHistoryModal
          section={section}
          details={profile.trophyDetails}
          onClose={() => setSection(null)}
        />
      )}
    </main>
  );
}
