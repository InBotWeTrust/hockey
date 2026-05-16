import type { ChatAttachmentDTO, ChatMessageDTO } from './api.js';
import { stripRichTextSyntax } from './richText.js';

const VOICE_PREVIEW = 'Голосовое сообщение';
const FILE_PREVIEW = 'Файл';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueContains(value: unknown, needles: string[]): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function collectAttachmentMetadata(metadata: ChatMessageDTO['metadata']): Record<string, unknown>[] {
  if (!isRecord(metadata)) return [];
  const items: Record<string, unknown>[] = [metadata];
  for (const key of ['attachment', 'file', 'media']) {
    const item = metadata[key];
    if (isRecord(item)) items.push(item);
  }
  for (const key of ['attachments', 'files', 'mediaItems']) {
    const list = metadata[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isRecord(item)) items.push(item);
    }
  }
  return items;
}

function attachmentKind(item: Record<string, unknown>): ChatAttachmentDTO['kind'] | null {
  const descriptorKeys = ['kind', 'type', 'mediaType', 'mimeType', 'mime', 'contentType', 'attachmentType'];
  if (descriptorKeys.some((key) => valueContains(item[key], ['voice', 'audio']))) return 'voice';
  if (descriptorKeys.some((key) => valueContains(item[key], ['image']))) return 'image';
  if (
    descriptorKeys.some((key) =>
      valueContains(item[key], ['file', 'document', 'attachment', 'video']),
    )
  ) {
    return 'file';
  }
  return typeof item.url === 'string' ? 'file' : null;
}

function attachmentName(item: Record<string, unknown>): string {
  for (const key of ['originalName', 'fileName', 'filename', 'name']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return '';
}

export function messageAttachments(metadata: ChatMessageDTO['metadata']): ChatAttachmentDTO[] {
  return collectAttachmentMetadata(metadata).flatMap((item, index) => {
    const url = item.url;
    if (typeof url !== 'string' || url.trim().length === 0) return [];
    const kind = attachmentKind(item);
    if (kind === null) return [];
    const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `${kind}-${index}`;
    const contentType =
      typeof item.contentType === 'string'
        ? item.contentType
        : typeof item.mimeType === 'string'
          ? item.mimeType
          : typeof item.mime === 'string'
            ? item.mime
            : undefined;
    const size = typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : undefined;
    const originalName = attachmentName(item);
    return [
      {
        id,
        url,
        kind,
        ...(contentType !== undefined ? { contentType } : {}),
        ...(size !== undefined ? { size } : {}),
        ...(originalName.length > 0 ? { originalName } : {}),
      },
    ];
  });
}

export function attachmentPreview(metadata: ChatMessageDTO['metadata']): string | null {
  const items = collectAttachmentMetadata(metadata);
  if (items.length === 0) return null;
  if (items.some((item) => attachmentKind(item) === 'voice')) return VOICE_PREVIEW;
  return items.some((item) => attachmentKind(item) !== null) ? FILE_PREVIEW : null;
}

interface MessageBodyPreviewOptions {
  stripFormatting?: boolean;
  limit?: number;
  fallback?: string;
}

export function messageBodyPreview(
  message: ChatMessageDTO,
  { stripFormatting = false, limit, fallback = 'Сообщение' }: MessageBodyPreviewOptions = {},
): string {
  const text = stripFormatting ? stripRichTextSyntax(message.content) : message.content;
  const normalized = text.trim();
  const body = normalized.length > 0 ? normalized : (attachmentPreview(message.metadata) ?? fallback);
  if (limit === undefined || body.length <= limit) return body;
  return `${body.slice(0, limit - 1).trimEnd()}…`;
}
