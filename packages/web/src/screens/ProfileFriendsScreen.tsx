import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { ReferralsScreen } from './ReferralsScreen.js';
import { apiFetch } from '../api/apiFetch.js';
import { fetchReferralSummary } from '../api/referrals.js';
import { DistrictPageHeader } from '../components/DistrictPageHeader.js';
import { SocialConnections } from '../social/SocialProfile.js';
import type { ProfileData } from './profileTypes.js';

export function ProfileFriendsScreen(): JSX.Element {
  const [tab, setTab] = useState<'circle' | 'invites'>('circle');
  const profile = useQuery<ProfileData>({ queryKey: ['profile'], queryFn: () => apiFetch('/me') });
  const referrals = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
  return (
    <main className="screen profile-detail-screen profile-friends-screen">
      <DistrictPageHeader title="Друзья" />
      <SegmentedTabs
        ariaLabel="Разделы друзей"
        activeTab={tab}
        onChange={setTab}
        items={[
          { id: 'circle', label: 'Мой круг' },
          { id: 'invites', label: 'Приглашения', attention: (referrals.data?.unclaimedRewardsCount ?? 0) > 0 },
        ]}
      />
      {tab === 'circle' ? <section className="apartment-friends-list">
        {profile.isPending ? (
          <p role="status">Загружаем профиль…</p>
        ) : !profile.data ? (
          <div role="alert">
            <p>Не удалось загрузить профиль.</p>
            <button className="btn btn--cta" onClick={() => void profile.refetch()}>
              Повторить
            </button>
          </div>
        ) : (
          <SocialConnections userId={profile.data.id} showListHeading />
        )}
      </section> : <ReferralsScreen embedded />}
    </main>
  );
}
