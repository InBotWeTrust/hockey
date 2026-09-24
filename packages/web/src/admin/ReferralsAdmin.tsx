import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { archiveAdminReferralMilestone, createAdminReferralMilestone, fetchAdminReferralMilestones, fetchAdminReferrals, previewAdminReferralMilestone, updateAdminReferralMilestone, type AdminReferralMilestone } from './api.js';

export function ReferralsAdmin(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [threshold, setThreshold] = useState('');
  const [stars, setStars] = useState('');
  const referrals = useQuery({ queryKey: ['admin', 'referrals', search], queryFn: () => fetchAdminReferrals(search) });
  const milestones = useQuery({ queryKey: ['admin', 'referrals', 'milestones'], queryFn: fetchAdminReferralMilestones });
  const preview = useQuery({ queryKey: ['admin', 'referrals', 'preview', threshold], queryFn: () => previewAdminReferralMilestone(Number(threshold)), enabled: Number(threshold) > 0 });
  const refresh = async (): Promise<void> => { await queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] }); };
  const create = useMutation({ mutationFn: createAdminReferralMilestone, onSuccess: refresh });
  const archive = useMutation({ mutationFn: archiveAdminReferralMilestone, onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: { qualifiedReferrals: number; rewardStars: number } }) => updateAdminReferralMilestone(id, body), onSuccess: refresh });
  const editMilestone = async (item: AdminReferralMilestone): Promise<void> => {
    const thresholdInput = window.prompt('Сколько друзей нужно?', String(item.qualified_referrals));
    if (thresholdInput === null) return;
    const starsInput = window.prompt('Сколько звёзд начислять?', String(item.reward_stars));
    if (starsInput === null) return;
    const qualifiedReferrals = Number(thresholdInput);
    const rewardStars = Number(starsInput);
    if (!Number.isInteger(qualifiedReferrals) || qualifiedReferrals < 1 || !Number.isInteger(rewardStars) || rewardStars < 1) return;
    const impact = await previewAdminReferralMilestone(qualifiedReferrals, item.id);
    if (window.confirm(`Изменение сразу откроет награду до ${impact.newlyEligibleCount} игроков. Сохранить?`)) update.mutate({ id: item.id, body: { qualifiedReferrals, rewardStars } });
  };
  const summary = referrals.data?.summary;
  return <section className="admin-referrals">
    <div className="admin-summary-grid">
      {[['Приглашений', summary?.totalInvitations], ['Стали любителями', summary?.qualifiedInvitations], ['Приглашают', summary?.inviters], ['Выдано звёзд', summary?.starsIssued]].map(([label, value]) => <article className="glass admin-summary-card" key={String(label)}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}
    </div>
    <section className="glass admin-panel"><h2>Рейтинг пригласивших</h2><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, фамилия, Telegram или VK ID" />
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Игрок</th><th>Код</th><th>Всего</th><th>Любители</th><th>Риск</th></tr></thead><tbody>{referrals.data?.inviters.map((item) => <tr key={item.userId}><td>{item.displayName}</td><td>{item.code}</td><td>{item.totalInvited}</td><td>{item.qualifiedInvited}</td><td>{item.riskSignals}</td></tr>)}</tbody></table></div>
    </section>
    <section className="glass admin-panel"><h2>Ступени наград</h2>
      <form className="admin-referral-form" onSubmit={(event) => { event.preventDefault(); const qualifiedReferrals = Number(threshold); const rewardStars = Number(stars); if (qualifiedReferrals > 0 && rewardStars > 0 && window.confirm(`Награду сразу откроют ${preview.data?.newlyEligibleCount ?? 0} игроков. Сохранить?`)) create.mutate({ qualifiedReferrals, rewardStars }); }}><input className="input" inputMode="numeric" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="Друзей" /><input className="input" inputMode="numeric" value={stars} onChange={(event) => setStars(event.target.value)} placeholder="Звёзд" /><button className="btn btn--cta" type="submit">Добавить</button></form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Друзей</th><th>Звёзд</th><th>Получено</th><th /></tr></thead><tbody>{milestones.data?.milestones.map((item) => <tr key={item.id}><td>{item.qualified_referrals}</td><td>{item.reward_stars}</td><td>{item.claimed_count}</td><td>{item.archived_at ? 'Архив' : <span className="admin-referral-actions"><button type="button" className="btn btn--ghost" onClick={() => void editMilestone(item)}>Изменить</button><button type="button" className="btn btn--ghost" onClick={() => { if (window.confirm('Архивировать ступень?')) archive.mutate(item.id); }}>Архивировать</button></span>}</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}
