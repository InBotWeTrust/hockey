import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingReferralCode, getPendingReferralCode, normalizeReferralCode, referralAuthFields, setPendingReferralCode } from './referral.js';

describe('referral auth state', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it('normalizes and keeps the pending code through an OAuth redirect', () => {
    expect(setPendingReferralCode(' аб-в 12! ', 'link')).toBe('АБ-В 12!');
    expect(getPendingReferralCode()).toBe('АБ-В 12!');
    expect(referralAuthFields()).toMatchObject({ referralCode: 'АБ-В 12!', referralSource: 'link' });
    clearPendingReferralCode();
    expect(getPendingReferralCode()).toBe('');
  });

  it('keeps arbitrary characters and caps the stored code length', () => {
    expect(normalizeReferralCode(`!?${'a'.repeat(40)}`)).toBe(`!?${'A'.repeat(30)}`);
  });

  it('reuses a stable installation id', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    expect(referralAuthFields().installationId).toBe('00000000-0000-4000-8000-000000000001');
    expect(referralAuthFields().installationId).toBe('00000000-0000-4000-8000-000000000001');
  });
});
