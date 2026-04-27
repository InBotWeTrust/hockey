// Domain errors for chat. All extend AppError so errorsPlugin maps them to HTTP.

import { AppError } from '../plugins/errors.js';

export class ChatAccessDeniedError extends AppError {
  constructor(public readonly chatId: string) {
    super('chat_access_denied', `User does not have access to chat ${chatId}`, 403);
    this.name = 'ChatAccessDeniedError';
  }
}

export class MessageNotFoundError extends AppError {
  constructor(public readonly messageId: string) {
    super('message_not_found', `Message ${messageId} not found`, 404);
    this.name = 'MessageNotFoundError';
  }
}

export class MessageNotOwnedError extends AppError {
  constructor(public readonly messageId: string) {
    super('message_not_owned', `User does not own message ${messageId}`, 403);
    this.name = 'MessageNotOwnedError';
  }
}

export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSec: number) {
    super('rate_limited', `Rate limit exceeded; retry after ${retryAfterSec}s`, 429);
    this.name = 'RateLimitedError';
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string) {
    super('invalid_input', message, 400);
    this.name = 'InvalidInputError';
  }
}

// Pin limit: at most 3 pinned chats per user. Surface as 400 with a stable
// error code so the client can render the localized toast.
export class PinLimitExceededError extends AppError {
  constructor(public readonly limit: number) {
    super('pin_limit_exceeded', `User already pinned ${limit} chats (max)`, 400);
    this.name = 'PinLimitExceededError';
  }
}
