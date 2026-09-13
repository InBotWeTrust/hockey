interface StoredAttempt {
  attemptId: string;
  paymentId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownerPrefix(ownerId: string): string {
  return `hockey.bank.attempt.${encodeURIComponent(ownerId)}.`;
}

function attemptKey(ownerId: string, packageId: string): string {
  return `${ownerPrefix(ownerId)}${encodeURIComponent(packageId)}`;
}

function readAttempt(key: string): StoredAttempt | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const attempt = JSON.parse(raw) as StoredAttempt;
  // Corrupt storage is not evidence that the old payment did not happen.
  if (
    !attempt ||
    typeof attempt.attemptId !== 'string' ||
    !UUID_PATTERN.test(attempt.attemptId) ||
    (attempt.paymentId !== undefined && typeof attempt.paymentId !== 'string')
  ) {
    throw new Error('Stored payment attempt requires review');
  }
  return attempt;
}

export function getOrCreatePaymentAttempt(ownerId: string, packageId: string): string {
  const key = attemptKey(ownerId, packageId);
  const stored = readAttempt(key);
  if (stored) return stored.attemptId;
  const attemptId = crypto.randomUUID();
  // Persist before the first request. Failure must stop payment creation.
  localStorage.setItem(key, JSON.stringify({ attemptId }));
  return attemptId;
}

export function rememberAttemptPayment(
  ownerId: string,
  packageId: string,
  attemptId: string,
  paymentId: string,
): void {
  if (typeof paymentId !== 'string' || !UUID_PATTERN.test(paymentId)) {
    throw new Error('Payment response requires review');
  }
  const key = attemptKey(ownerId, packageId);
  if (readAttempt(key)?.attemptId === attemptId) {
    localStorage.setItem(key, JSON.stringify({ attemptId, paymentId }));
  }
}

export function completePaymentAttempt(ownerId: string, paymentId: string): void {
  const prefix = ownerPrefix(ownerId);
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  for (const key of keys) {
    if (key?.startsWith(prefix) && readAttempt(key)?.paymentId === paymentId) {
      localStorage.removeItem(key);
    }
  }
}
