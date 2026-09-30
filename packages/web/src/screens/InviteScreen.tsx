import { Navigate, useParams } from 'react-router-dom';
import { setPendingReferralCode } from '../auth/referral.js';

export function InviteScreen(): JSX.Element {
  const { code = '' } = useParams();
  setPendingReferralCode(code, 'link');
  return <Navigate to="/login" replace />;
}
