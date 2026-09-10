export type TournamentSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface TournamentRealtimeEvent {
  type: 'tournament:fixture_update' | 'tournament:presence';
  fixtureId: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export interface TournamentEventFrame {
  v: 1;
  event: TournamentRealtimeEvent;
}

export interface TournamentSocketOptions {
  fixtureId: string;
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  onEvent: (event: TournamentRealtimeEvent) => void;
  onStatus: (status: TournamentSocketStatus) => void;
}

const CLOSE_NORMAL = 1000;
const CLOSE_UNAUTHORIZED = 4401;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_SEEN_EVENTS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTournamentEventFrame(value: unknown, fixtureId: string): value is TournamentEventFrame {
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.event)) return false;
  const event = value.event;
  return (
    (event.type === 'tournament:fixture_update' || event.type === 'tournament:presence') &&
    event.fixtureId === fixtureId &&
    typeof event.sequence === 'number' &&
    Number.isFinite(event.sequence) &&
    isRecord(event.payload)
  );
}

function buildUrl(fixtureId: string, token: string): string {
  const path = `/api/tournaments/fixtures/${encodeURIComponent(fixtureId)}/ws?token=${encodeURIComponent(token)}`;
  if (typeof window === 'undefined') return path;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${path}`;
}

export class TournamentSocket {
  private ws: WebSocket | null = null;
  private readonly options: TournamentSocketOptions;
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private status: TournamentSocketStatus = 'closed';
  private stopped = false;
  private attemptedConnection = false;
  private readonly seenEventKeys = new Set<string>();

  constructor(options: TournamentSocketOptions) {
    this.options = options;
  }

  connect(): void {
    this.stopped = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openWith(this.options.getToken());
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      try {
        this.ws.close(CLOSE_NORMAL, 'client disconnect');
      } catch {
        // The socket may already have been torn down by the browser.
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  private openWith(token: string | null): void {
    if (this.stopped) return;
    if (token === null) {
      this.setStatus('closed');
      return;
    }
    this.setStatus(this.attemptedConnection ? 'reconnecting' : 'connecting');
    this.attemptedConnection = true;

    let socket: WebSocket;
    try {
      socket = new WebSocket(buildUrl(this.options.fixtureId, token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.backoffMs = MIN_BACKOFF_MS;
      this.setStatus('open');
    };
    socket.onmessage = (message: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof message.data === 'string' ? message.data : '');
      } catch {
        return;
      }
      if (!isTournamentEventFrame(parsed, this.options.fixtureId)) return;
      const eventKey = JSON.stringify(parsed.event);
      if (this.seenEventKeys.has(eventKey)) return;
      this.seenEventKeys.add(eventKey);
      if (this.seenEventKeys.size > MAX_SEEN_EVENTS) {
        const oldest = this.seenEventKeys.values().next().value as string | undefined;
        if (oldest !== undefined) this.seenEventKeys.delete(oldest);
      }
      this.options.onEvent(parsed.event);
    };
    socket.onclose = (event: CloseEvent) => {
      this.ws = null;
      if (this.stopped) {
        this.setStatus('closed');
        return;
      }
      if (event.code === CLOSE_UNAUTHORIZED) {
        void this.refreshAndReconnect();
        return;
      }
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // Browsers follow an error frame with close; reconnect from that path once.
    };
  }

  private async refreshAndReconnect(): Promise<void> {
    this.setStatus('reconnecting');
    let token: string | null = null;
    try {
      token = await this.options.refresh();
    } catch {
      token = null;
    }
    if (this.stopped) return;
    if (token === null) {
      this.stopped = true;
      this.setStatus('closed');
      return;
    }
    this.openWith(token);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWith(this.options.getToken());
    }, delay);
  }

  private setStatus(status: TournamentSocketStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
