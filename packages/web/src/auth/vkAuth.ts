const REDIRECT_PATH = '/auth/vk/callback';

function generateRandomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  sessionStorage.setItem('vk_code_verifier', codeVerifier);
  return { codeVerifier, codeChallenge };
}

export function getRedirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

export function buildVkAuthorizeUrl(input: {
  appId: string;
  codeChallenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.appId,
    redirect_uri: getRedirectUri(),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 's256',
    scope: '',
  });
  return `https://id.vk.com/authorize?${params.toString()}`;
}

export async function startVkOAuth(): Promise<void> {
  const appId = import.meta.env.VITE_VK_APP_ID;
  if (!appId) {
    throw new Error('VITE_VK_APP_ID is not configured');
  }

  const { codeChallenge } = await generatePKCE();
  const state = generateRandomString(16);
  sessionStorage.setItem('vk_oauth_state', state);

  window.location.href = buildVkAuthorizeUrl({ appId, codeChallenge, state });
}

export function extractCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('code');
}

export function extractDeviceIdFromUrl(): string {
  return new URLSearchParams(window.location.search).get('device_id') ?? '';
}

export function extractErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return null;
  return params.get('error_description') ?? error;
}

export function extractStateFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('state');
}

export function getCodeVerifier(): string {
  return sessionStorage.getItem('vk_code_verifier') ?? '';
}

export function getStoredState(): string {
  return sessionStorage.getItem('vk_oauth_state') ?? '';
}

export function cleanupOAuthState(): void {
  sessionStorage.removeItem('vk_code_verifier');
  sessionStorage.removeItem('vk_oauth_state');
}
