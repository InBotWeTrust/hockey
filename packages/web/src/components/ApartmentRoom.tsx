import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReferralSummary } from '../api/referrals.js';
import './apartment-room.css';

/** Keep claimable invitation rewards visible even away from the friends page. */
export function ApartmentReferralAttention({ onCount }: { onCount: (count: number) => void }) {
  const summary = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
  useEffect(() => {
    onCount(summary.data?.unclaimedRewardsCount ?? 0);
  }, [summary.data?.unclaimedRewardsCount, onCount]);
  return null;
}
