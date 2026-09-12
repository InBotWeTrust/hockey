import { apiFetch } from './apiFetch.js';

export type CoinPackageMarker = 'hit' | 'top' | 'premium';
export type CoinPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';

export interface CoinPackage {
  id: string;
  slug: string;
  title: string;
  description: string;
  coinAmount: number;
  priceRub: number;
  badgeText: string | null;
  marker: CoinPackageMarker | null;
  sortOrder: number;
}

export interface CoinPayment {
  paymentId: string;
  status: CoinPaymentStatus;
  confirmationUrl: string | null;
}

export interface CoinPaymentStatusResponse {
  status: CoinPaymentStatus;
}

export function fetchCoinPackages(): Promise<{ packages: CoinPackage[] }> {
  return apiFetch<{ packages: CoinPackage[] }>('/bank/packages');
}

export function createCoinPayment(packageId: string, attemptId: string): Promise<CoinPayment> {
  return apiFetch<CoinPayment>('/bank/payments', {
    method: 'POST',
    body: JSON.stringify({ packageId, attemptId }),
  });
}

export function fetchCoinPaymentStatus(paymentId: string): Promise<CoinPaymentStatusResponse> {
  return apiFetch<CoinPaymentStatusResponse>(`/bank/payments/${paymentId}`);
}
