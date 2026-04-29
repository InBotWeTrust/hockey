import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildVkAuthorizeUrl,
  cleanupOAuthState,
  extractCodeFromUrl,
  extractDeviceIdFromUrl,
  extractErrorFromUrl,
  extractStateFromUrl,
  getCodeVerifier,
  getRedirectUri,
  getStoredState,
} from './vkAuth.js';

describe('vkAuth URL helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('builds exact VK callback redirect URI', () => {
    window.history.pushState({}, '', '/login');
    expect(getRedirectUri()).toBe('http://localhost:3000/auth/vk/callback');
  });

  it('builds authorize URL with PKCE params', () => {
    const url = new URL(
      buildVkAuthorizeUrl({ appId: '777', codeChallenge: 'challenge', state: 'state' }),
    );
    expect(url.origin + url.pathname).toBe('https://id.vk.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('777');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/vk/callback');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('scope')).toBe('');
  });

  it('extracts callback params and cleans session state', () => {
    window.history.pushState(
      {},
      '',
      '/auth/vk/callback?code=C&device_id=D&state=S&error_description=Denied',
    );
    sessionStorage.setItem('vk_code_verifier', 'V');
    sessionStorage.setItem('vk_oauth_state', 'S');

    expect(extractCodeFromUrl()).toBe('C');
    expect(extractDeviceIdFromUrl()).toBe('D');
    expect(extractStateFromUrl()).toBe('S');
    expect(extractErrorFromUrl()).toBeNull();
    expect(getCodeVerifier()).toBe('V');
    expect(getStoredState()).toBe('S');

    cleanupOAuthState();
    expect(getCodeVerifier()).toBe('');
    expect(getStoredState()).toBe('');
  });

  it('extracts VK error from callback URL', () => {
    window.history.pushState(
      {},
      '',
      '/auth/vk/callback?error=access_denied&error_description=Denied',
    );
    expect(extractErrorFromUrl()).toBe('Denied');
  });
});
