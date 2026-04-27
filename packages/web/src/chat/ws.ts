import type { ChatEvent, ChatEventFrame } from './api.js';

export type ChatSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ChatSocketOptions {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onEvent: (event: ChatEvent) => void;
  onStatus: (status: ChatSocketStatus) => void;
}

const CLOSE_NORMAL = 1000;
const CLOSE_UNAUTHORIZED = 4401;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'message:new',
  'message:deleted',
  'reaction:added',
  'reaction:removed',
  'chat:read',
  'connection:ready',
]);

function isChatEventFrame(value: unknown): value is ChatEventFrame {
  if (typeof value !== 'object' || value === null) return false;
  const v = (value as { v?: unknown }).v;
  const event = (value as { event?: unknown }).event;
  if (v !== 1) return false;
  if (typeof event !== 'object' || event === null) return false;
  const type = (event as { type?: unknown }).type;
  return typeof type === 'string' && KNOWN_EVENT_TYPES.has(type);
}

function buildUrl(token: string): string {
  if (typeof window === 'undefined') return `/api/chat/ws?token=${encodeURIComponent(token)}`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/chat/ws?token=${encodeURIComponent(token)}`;
}

export class ChatSocket {
  private ws: WebSocket | null = null;
  private opts: ChatSocketOptions;
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: ChatSocketStatus = 'closed';
  private stopped = false;

  constructor(opts: ChatSocketOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.stopped) this.stopped = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openWith(this.opts.getToken());
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(CLOSE_NORMAL, 'client disconnect');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  private openWith(token: string | null): void {
    if (this.stopped) return;
    if (!token) {
      this.setStatus('closed');
      return;
    }
    this.setStatus(this.ws ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(buildUrl(token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoffMs = MIN_BACKOFF_MS;
      this.setStatus('open');
    };

    ws.onmessage = (ev: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (!isChatEventFrame(parsed)) return;
      this.opts.onEvent(parsed.event);
    };

    ws.onclose = (ev: CloseEvent) => {
      this.ws = null;
      if (this.stopped) {
        this.setStatus('closed');
        return;
      }
      if (ev.code === CLOSE_UNAUTHORIZED) {
        void this.refreshAndReconnect();
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // Mirror to onclose path; browser will fire close right after on error.
    };
  }

  private async refreshAndReconnect(): Promise<void> {
    this.setStatus('reconnecting');
    let newToken: string | null = null;
    try {
      newToken = await this.opts.refresh();
    } catch {
      newToken = null;
    }
    if (this.stopped) return;
    if (!newToken) {
      this.setStatus('closed');
      this.stopped = true;
      return;
    }
    this.openWith(newToken);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWith(this.opts.getToken());
    }, delay);
  }

  private setStatus(next: ChatSocketStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.opts.onStatus(next);
  }
}
