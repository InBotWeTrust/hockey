import type { DriftControl, CaretakerVariant } from '@hockey/game-core';
import { apiFetch } from './apiFetch.js';
export interface DriftSession {
  variant?: CaretakerVariant;
  attemptId: string;
  seed: string;
  version: number;
  seq: number;
  progress: number;
  completed: boolean;
  serverNow: string;
  readyAt: string;
  showInstruction: boolean;
}
export const startDrift = (requestId: string, variant?: CaretakerVariant) =>
  apiFetch<DriftSession>('/duel/daily/caretaker/drift/start', {
    method: 'POST',
    body: JSON.stringify({ requestId, variant }),
  });
export const sendDrift = (attemptId: string, seq: number, controls: DriftControl[]) =>
  apiFetch<DriftSession>('/duel/daily/caretaker/drift/action', {
    method: 'POST',
    body: JSON.stringify({ attemptId, seq, controls }),
  });
