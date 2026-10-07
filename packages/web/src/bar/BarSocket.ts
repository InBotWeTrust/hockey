import { getWebSocketBaseUrl } from '../platform/runtime.js';
import type { BarBoard, BarLive } from './types.js';
export type BarSocketStatus = 'connecting' | 'ready' | 'reconnecting' | 'closed';
export interface BarSocketOptions {
  resource: string;
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onSnapshot: (data: BarBoard | BarLive) => void;
  onStatus: (status: BarSocketStatus) => void;
}
export class BarSocket {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private backoff = 1000;
  constructor(private readonly options: BarSocketOptions) {}
  connect(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open(this.options.getToken());
  }
  disconnect(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.timer = null;
    this.deadline = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
    this.options.onStatus('closed');
  }
  private open(token: string | null): void {
    if (this.stopped) return;
    if (!token) {
      this.stopped = true;
      this.options.onStatus('closed');
      return;
    }
    this.options.onStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(
        `${getWebSocketBaseUrl()}/api/bar/ws?${this.options.resource}&token=${encodeURIComponent(token)}`,
      );
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    this.deadline = setTimeout(() => socket.close(4000, 'snapshot timeout'), 15000);
    socket.onmessage = (event: MessageEvent) => {
      if (this.stopped || this.socket !== socket) return;
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof data === 'object' && data !== null && 'error' in data) {
        this.options.onStatus('reconnecting');
        return;
      }
      if (!isSnapshot(data)) return;
      if (this.deadline !== null) clearTimeout(this.deadline);
      this.deadline = null;
      this.backoff = 1000;
      this.options.onStatus('ready');
      this.options.onSnapshot(data);
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      if (this.deadline !== null) clearTimeout(this.deadline);
      this.deadline = null;
      if ([4400, 4403, 4429].includes(event.code)) {
        this.stopped = true;
        this.options.onStatus('closed');
        return;
      }
      if (event.code === 4401) {
        this.options.onStatus('reconnecting');
        void this.options
          .refresh()
          .then((next) => {
            if (this.stopped) return;
            if (next === null) {
              this.stopped = true;
              this.options.onStatus('closed');
            } else this.open(next);
          })
          .catch(() => this.retry());
      } else this.retry();
    };
    socket.onerror = () => undefined;
  }
  private retry(): void {
    if (this.stopped) return;
    this.options.onStatus('reconnecting');
    const delay = this.backoff;
    this.backoff = Math.min(30000, this.backoff * 2);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open(this.options.getToken());
    }, delay);
  }
}
function isSnapshot(data: unknown): data is BarBoard | BarLive {
  if (typeof data !== 'object' || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    (Array.isArray(value.online) &&
      Array.isArray(value.upcoming) &&
      typeof value.page === 'number') ||
    ('match' in value && Array.isArray(value.shots))
  );
}
