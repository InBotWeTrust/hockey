import { useEffect } from 'react';
import { fetchReferralSummary } from '../api/referrals.js';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Award, Medal, Target } from 'lucide-react';
import { apiFetch } from '../api/apiFetch.js';
import type { ProfileData } from '../screens/profileTypes.js';
import './apartment-room.css';
const collection = (profile?: ProfileData) => {
  const icons = [Trophy, Award, Medal, Target];
  const trophies = Object.values(profile?.trophySummary ?? {}).flatMap((count, index) =>
    count > 0 ? [icons[index]!] : [],
  );
  const achievements = (profile?.achievements ?? []).filter(
    (a) => a.status === 'claimed' || !!a.claimedAt || (a.stage?.history.length ?? 0) > 0,
  );
  return { trophies, achievements };
};
export function ApartmentAwardsDecoration() {
  const { data } = useQuery<ProfileData>({ queryKey: ['profile'], queryFn: () => apiFetch('/me') });
  const { trophies, achievements } = collection(data);
  return (
    <div className="apartment-room-awards" aria-hidden="true">
      {trophies.map((Icon, index) => (
        <Icon key={`t${index}`} />
      ))}
      {achievements.slice(0, Math.max(0, 8 - trophies.length)).map((a) => (
        <img key={a.id} src={a.photoUrl} alt="" />
      ))}
    </div>
  );
}
export function ApartmentRoomOverview({
  pages,
  selected,
  onSelect,
  onReferralCount,
}: {
  pages: readonly { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  onReferralCount: (count:number) => void;
}) {
  const summary = useQuery({queryKey:['referrals','summary'],queryFn:fetchReferralSummary});
  useEffect(()=>{onReferralCount(summary.data?.unclaimedRewardsCount??0);},[summary.data?.unclaimedRewardsCount,onReferralCount]);
  return (
    <section className="apartment-room-overview" aria-label="Комната игрока">
      <img
        src="/section-panoramas/apartment-v1.webp"
        alt="Комната с зеркалом, шкафом, витриной наград, рабочим столом, доской друзей и телевизором"
        draggable={false}
      />
      <ApartmentAwardsDecoration />
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          title={page.label}
          aria-label={`В комнате: ${page.label}`}
          aria-pressed={selected === page.id}
          style={{ left: `${(index * 100) / 6}%` }}
          onClick={() => onSelect(page.id)}
        />
      ))}
    </section>
  );
}
