import { Buffer } from 'node:buffer';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { assertCanAccessChat } from '../chat/guards.js';
import { appendEvent } from '../duel/eventLog.js';
import { createMediaObjectKey, type ObjectStorageClient } from '../storage/objectStorage.js';

type MediaPurpose = 'chat_attachment' | 'profile_avatar' | 'chat_avatar';
type MediaKind = 'image' | 'voice' | 'file';

interface MediaRoutesOptions {
  objectStorage?: ObjectStorageClient;
}

interface MediaObjectRow {
  id: string;
  owner_user_id: string;
  purpose: MediaPurpose;
  object_key: string;
  url: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
  created_at: Date;
}

const uuid = z.string().uuid();
const MB = 1024 * 1024;
const avatarContentTypes = new Set(['image/webp']);
const chatContentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
  'application/zip',
  'application/octet-stream',
  'text/plain',
]);
const mediaLimits = {
  avatarWebpBytes: 2 * MB,
  chatImageBytes: 10 * MB,
  chatVoiceBytes: 25 * MB,
  chatFileBytes: 25 * MB,
};

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeContentType(value: string | string[] | undefined): string {
  return readHeader(value)?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function cleanOriginalName(value: string | string[] | undefined): string {
  return (readHeader(value) ?? '')
    .replace(/[^\wа-яА-ЯёЁ ._()-]/g, '')
    .trim()
    .slice(0, 160);
}

function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'voice';
  return 'file';
}

function chatUploadLimit(contentType: string): number {
  const kind = mediaKind(contentType);
  if (kind === 'image') return mediaLimits.chatImageBytes;
  if (kind === 'voice') return mediaLimits.chatVoiceBytes;
  return mediaLimits.chatFileBytes;
}

function mapMedia(row: MediaObjectRow) {
  return {
    id: row.id,
    url: row.url,
    key: row.object_key,
    kind: mediaKind(row.content_type),
    contentType: row.content_type,
    size: row.size_bytes,
    originalName: row.original_name,
    createdAt: row.created_at.toISOString(),
  };
}

async function saveMediaObject({
  app,
  ownerUserId,
  purpose,
  objectKey,
  url,
  contentType,
  size,
  originalName,
}: {
  app: Parameters<FastifyPluginAsync>[0];
  ownerUserId: string;
  purpose: MediaPurpose;
  objectKey: string;
  url: string;
  contentType: string;
  size: number;
  originalName: string;
}): Promise<MediaObjectRow> {
  const { rows } = await app.pg.query<MediaObjectRow>(
    `insert into media_objects
       (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, owner_user_id, purpose, object_key, url, content_type,
               size_bytes, original_name, created_at`,
    [ownerUserId, purpose, objectKey, url, contentType, size, originalName],
  );
  return rows[0]!;
}

async function uploadMedia({
  app,
  objectStorage,
  userId,
  purpose,
  prefix,
  body,
  contentType,
  originalName,
}: {
  app: Parameters<FastifyPluginAsync>[0];
  objectStorage: ObjectStorageClient;
  userId: string;
  purpose: MediaPurpose;
  prefix: string;
  body: Buffer;
  contentType: string;
  originalName: string;
}) {
  const key = createMediaObjectKey({ prefix, contentType });
  let uploaded;
  try {
    uploaded = await objectStorage.uploadObject({ key, body, contentType });
  } catch (err) {
    app.log.error({ err, key, purpose, userId }, 'object storage media upload failed');
    throw new AppError('storage_upload_failed', 'Не удалось загрузить файл в хранилище', 502);
  }
  const row = await saveMediaObject({
    app,
    ownerUserId: userId,
    purpose,
    objectKey: uploaded.key,
    url: uploaded.url,
    contentType: uploaded.contentType,
    size: uploaded.size,
    originalName,
  });
  return mapMedia(row);
}

function assertUploadBody(
  body: unknown,
  contentType: string,
  allowedTypes: Set<string>,
  maxBytes: number,
): Buffer {
  if (!allowedTypes.has(contentType)) {
    throw new AppError('unsupported_media_type', 'unsupported media type', 415);
  }
  if (!(body instanceof Buffer) || body.byteLength === 0) {
    throw new AppError('bad_request', 'empty upload body', 400);
  }
  if (body.byteLength > maxBytes) {
    throw new AppError('payload_too_large', 'upload is too large', 413);
  }
  return body;
}

export const mediaRoutes: FastifyPluginAsync<MediaRoutesOptions> = async (app, options) => {
  app.addContentTypeParser(
    /^(?:image\/(?:jpeg|png|webp|gif)|audio\/(?:mpeg|mp4|wav|ogg|webm)|application\/(?:pdf|zip|octet-stream)|text\/plain)$/i,
    { parseAs: 'buffer', bodyLimit: options.objectStorage?.maxUploadBytes ?? mediaLimits.chatFileBytes },
    (_req, body, done) => done(null, body),
  );

  app.post('/me/avatar', { preHandler: [app.authenticate] }, async (req) => {
    if (options.objectStorage === undefined) {
      throw new AppError('storage_not_configured', 'object storage is not configured', 503);
    }

    const contentType = normalizeContentType(req.headers['content-type']);
    const body = assertUploadBody(
      req.body,
      contentType,
      avatarContentTypes,
      Math.min(mediaLimits.avatarWebpBytes, options.objectStorage.maxUploadBytes),
    );
    const media = await uploadMedia({
      app,
      objectStorage: options.objectStorage,
      userId: req.user.id,
      purpose: 'profile_avatar',
      prefix: `avatars/${req.user.id}`,
      body,
      contentType,
      originalName: cleanOriginalName(req.headers['x-file-name']),
    });

    await app.pg.query(
      `update users
          set custom_avatar_url = $1,
              custom_display_name = coalesce(custom_display_name, display_name),
              avatar_url = $1,
              display_source = 'custom'
        where id = $2`,
      [media.url, req.user.id],
    );
    await appendEvent(app.pg, req.user.id, 'profile_avatar_uploaded', {
      media_id: media.id,
      key: media.key,
      size: media.size,
      content_type: media.contentType,
    });

    return {
      avatarUrl: media.url,
      customAvatarUrl: media.url,
      displaySource: 'custom',
      media,
    };
  });

  app.post('/chat/:chatId/uploads', { preHandler: [app.authenticate] }, async (req) => {
    if (options.objectStorage === undefined) {
      throw new AppError('storage_not_configured', 'object storage is not configured', 503);
    }

    const { chatId } = z.object({ chatId: uuid }).parse(req.params);
    await assertCanAccessChat(app.pg, req.user.id, chatId);

    const contentType = normalizeContentType(req.headers['content-type']);
    const body = assertUploadBody(
      req.body,
      contentType,
      chatContentTypes,
      Math.min(chatUploadLimit(contentType), options.objectStorage.maxUploadBytes),
    );
    const media = await uploadMedia({
      app,
      objectStorage: options.objectStorage,
      userId: req.user.id,
      purpose: 'chat_attachment',
      prefix: `chat/${chatId}/${req.user.id}`,
      body,
      contentType,
      originalName: cleanOriginalName(req.headers['x-file-name']),
    });
    await appendEvent(app.pg, req.user.id, 'chat_attachment_uploaded', {
      chat_id: chatId,
      media_id: media.id,
      key: media.key,
      size: media.size,
      content_type: media.contentType,
    });

    return { media };
  });
};
