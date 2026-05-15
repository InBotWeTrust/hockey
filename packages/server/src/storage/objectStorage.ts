import { createHash, createHmac, randomUUID } from 'node:crypto';

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  tenantId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  maxUploadBytes: number;
}

export interface ObjectStorageUploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectStorageUploadResult {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export interface ObjectStorageClient {
  maxUploadBytes: number;
  uploadObject(input: ObjectStorageUploadInput): Promise<ObjectStorageUploadResult>;
  publicUrlForKey(key: string): string;
}

interface CreateObjectStorageClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const serviceName = 's3';
const algorithm = 'AWS4-HMAC-SHA256';

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function encodePathSegments(segments: string[]): string {
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function objectPathSegments(endpoint: URL, bucket: string, key?: string): string[] {
  const endpointSegments = endpoint.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const baseSegments =
    endpointSegments.at(-1) === bucket ? endpointSegments : [...endpointSegments, bucket];
  return key === undefined ? baseSegments : [...baseSegments, ...key.split('/').filter(Boolean)];
}

function objectUrl(config: ObjectStorageConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  endpoint.pathname = encodePathSegments(objectPathSegments(endpoint, config.bucket, key));
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

function defaultPublicBaseUrl(config: ObjectStorageConfig): string {
  const endpoint = new URL(config.endpoint);
  endpoint.pathname = encodePathSegments(objectPathSegments(endpoint, config.bucket));
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString().replace(/\/$/, '');
}

export function buildPublicObjectUrl(config: ObjectStorageConfig, key: string): string {
  const baseUrl = (config.publicBaseUrl ?? defaultPublicBaseUrl(config)).replace(/\/$/, '');
  const encodedKey = key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${baseUrl}/${encodedKey}`;
}

function amzDateParts(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { dateStamp: iso.slice(0, 8), amzDate: iso };
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, serviceName);
  return hmac(dateRegionServiceKey, 'aws4_request');
}

function signedHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .map((header) => header.toLowerCase())
    .sort()
    .join(';');
}

function canonicalHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');
}

function authorizationHeader({
  config,
  method,
  url,
  contentType,
  payloadHash,
  date,
}: {
  config: ObjectStorageConfig;
  method: string;
  url: URL;
  contentType: string;
  payloadHash: string;
  date: Date;
}): {
  authorization: string;
  amzDate: string;
} {
  const { dateStamp, amzDate } = amzDateParts(date);
  const credentialAccessKeyId =
    config.tenantId !== undefined && !config.accessKeyId.includes(':')
      ? `${config.tenantId}:${config.accessKeyId}`
      : config.accessKeyId;
  const headers = {
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = signedHeaders(headers);
  const credentialScope = `${dateStamp}/${config.region}/${serviceName}/aws4_request`;
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders(headers),
    signedHeaderNames,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign)
    .digest('hex');

  return {
    amzDate,
    authorization: `${algorithm} Credential=${credentialAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
  };
}

export function createObjectStorageClient(
  config: ObjectStorageConfig,
  options: CreateObjectStorageClientOptions = {},
): ObjectStorageClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    maxUploadBytes: config.maxUploadBytes,
    publicUrlForKey: (key: string) => buildPublicObjectUrl(config, key),
    async uploadObject(input: ObjectStorageUploadInput): Promise<ObjectStorageUploadResult> {
      const url = objectUrl(config, input.key);
      const payloadHash = sha256Hex(input.body);
      const signature = authorizationHeader({
        config,
        method: 'PUT',
        url,
        contentType: input.contentType,
        payloadHash,
        date: now(),
      });
      const res = await fetchImpl(url, {
        method: 'PUT',
        body: input.body,
        headers: {
          Authorization: signature.authorization,
          'Content-Type': input.contentType,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': signature.amzDate,
        },
      });
      if (!res.ok) {
        throw new Error(`object storage upload failed: ${res.status}`);
      }
      return {
        key: input.key,
        url: buildPublicObjectUrl(config, input.key),
        contentType: input.contentType,
        size: input.body.byteLength,
      };
    },
  };
}

export function createMediaObjectKey({
  prefix,
  contentType,
}: {
  prefix: string;
  contentType: string;
}): string {
  const extension =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : contentType === 'image/gif'
            ? 'gif'
            : contentType === 'audio/mpeg'
              ? 'mp3'
              : contentType === 'audio/mp4'
                ? 'm4a'
                : contentType === 'audio/wav'
                  ? 'wav'
                  : contentType === 'audio/ogg'
                    ? 'ogg'
                    : contentType === 'audio/webm'
                      ? 'webm'
                      : 'bin';
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix.replace(/^\/+|\/+$/g, '')}/${year}/${month}/${randomUUID()}.${extension}`;
}
