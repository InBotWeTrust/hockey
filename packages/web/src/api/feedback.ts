import { apiFetch } from './apiFetch.js';

export type FeedbackKind = 'review' | 'suggestion' | 'question';

export interface FeedbackCreatePayload {
  kind: FeedbackKind;
  rating?: number | null;
  message: string;
}

export interface FeedbackDTO {
  id: string;
  kind: FeedbackKind;
  rating: number | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function createFeedback(payload: FeedbackCreatePayload): Promise<{ feedback: FeedbackDTO }> {
  return apiFetch<{ feedback: FeedbackDTO }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendOfficialMessage(message: string): Promise<{
  chatId: string;
  messageId: string;
}> {
  return apiFetch('/feedback/direct', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
