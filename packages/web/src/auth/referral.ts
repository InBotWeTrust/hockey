const PENDING_REFERRAL_KEY = 'hockey.pendingReferral';
const PENDING_REFERRAL_SOURCE_KEY = 'hockey.pendingReferralSource';
const INSTALLATION_KEY = 'hockey.installationId';

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase().slice(0, 32);
}

export function getPendingReferralCode(): string {
  try { return sessionStorage.getItem(PENDING_REFERRAL_KEY) ?? ''; } catch { return ''; }
}

export function setPendingReferralCode(value: string, source: 'manual' | 'link' = 'manual'): string {
  const code = normalizeReferralCode(value);
  try {
    if (code) {
      sessionStorage.setItem(PENDING_REFERRAL_KEY, code);
      sessionStorage.setItem(PENDING_REFERRAL_SOURCE_KEY, source);
    } else {
      sessionStorage.removeItem(PENDING_REFERRAL_KEY);
      sessionStorage.removeItem(PENDING_REFERRAL_SOURCE_KEY);
    }
  } catch { /* Embedded browsers may block storage. */ }
  return code;
}

export function clearPendingReferralCode(): void {
  try { sessionStorage.removeItem(PENDING_REFERRAL_KEY); sessionStorage.removeItem(PENDING_REFERRAL_SOURCE_KEY); } catch { /* noop */ }
}

export function getInstallationId(): string {
  try {
    const saved = localStorage.getItem(INSTALLATION_KEY);
    if (saved) return saved;
    const value = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, value);
    return value;
  } catch { return ''; }
}

export function referralAuthFields(): Record<string, string> {
  const referralCode = getPendingReferralCode();
  let referralSource: 'manual' | 'link' = 'manual';
  try { if (sessionStorage.getItem(PENDING_REFERRAL_SOURCE_KEY) === 'link') referralSource = 'link'; } catch { /* noop */ }
  return {
    ...(referralCode ? { referralCode, referralSource } : {}),
    ...(getInstallationId() ? { installationId: getInstallationId() } : {}),
  };
}
