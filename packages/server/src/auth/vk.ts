const TOKEN_URL = 'https://id.vk.com/oauth2/auth';
const USERINFO_URL = 'https://id.vk.com/oauth2/user_info';

export interface VkExchangeResult {
  vkUserId: number;
  accessToken: string;
  expiresIn: number;
}

export interface VkProfile {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  screenName?: string;
}

type FetchLike = typeof fetch;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function exchangeVkCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  deviceId: string;
  appId: string;
  fetchImpl?: FetchLike;
}): Promise<VkExchangeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    device_id: input.deviceId,
  });

  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await readJson(res);

  if (data.error) {
    const message =
      optionalString(data.error_description) ?? optionalString(data.error) ?? 'unknown';
    throw new Error(`vk_oauth: ${message}`);
  }

  const vkUserId =
    typeof data.user_id === 'number'
      ? data.user_id
      : typeof data.user_id === 'string'
        ? Number(data.user_id)
        : 0;
  if (!Number.isFinite(vkUserId) || vkUserId <= 0) {
    throw new Error('vk_invalid_user_id');
  }

  const accessToken = optionalString(data.access_token);
  if (!accessToken) {
    throw new Error('vk_missing_access_token');
  }

  const expiresIn =
    typeof data.expires_in === 'number'
      ? data.expires_in
      : typeof data.expires_in === 'string'
        ? Number(data.expires_in)
        : 0;

  return {
    vkUserId,
    accessToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : 0,
  };
}

export async function fetchVkProfile(input: {
  accessToken: string;
  appId: string;
  fetchImpl?: FetchLike;
}): Promise<VkProfile> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    access_token: input.accessToken,
    client_id: input.appId,
  });

  const res = await fetchImpl(USERINFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await readJson(res);
  if (data.error) return {};

  const rawUser = data.user;
  if (!rawUser || typeof rawUser !== 'object') return {};
  const user = rawUser as Record<string, unknown>;

  const profile: VkProfile = {};
  const firstName = optionalString(user.first_name);
  const lastName = optionalString(user.last_name);
  const avatarUrl = optionalString(user.avatar);
  const screenName = optionalString(user.screen_name);
  if (firstName !== undefined) profile.firstName = firstName;
  if (lastName !== undefined) profile.lastName = lastName;
  if (avatarUrl !== undefined) profile.avatarUrl = avatarUrl;
  if (screenName !== undefined) profile.screenName = screenName;
  return profile;
}
