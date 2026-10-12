// Synthetic preview transport only. Never imported by the application entry.
import { durakTable, createRng } from '@hockey/game-core';
import type { RoomView, RoomCommand } from './roomApi.js';
export function installRoomPreview() {
  const params = new URLSearchParams(location.search);
  const scene = params.get('table');
  if (!scene) return;
  const original = window.fetch.bind(window);
  const names = ['Александр', 'Борис', 'Дмитрий', 'Максим', 'Егор', 'Иван'];
  let game: durakTable.TableGame | null = null;
  let room: RoomView | null = null;
  const make = (capacity: number, searching: boolean) => {
    const count = ['game', 'ready'].includes(scene) ? capacity : Math.min(capacity - 1, 3);
    room = {
      id: 'demo-room',
      owner: 'demo-player',
      capacity,
      status: 'waiting',
      searchUntil: scene === 'expired' ? 0 : searching ? Date.now() + 120000 : null,
      countdownAt: null,
      proposed: false,
      ready: [],
      revision: 0,
      serverNow: Date.now(),
      pending: [],
      game: null,
      seats: Array.from({ length: count }, (_, i) => ({
        userId: i ? `demo-${i}` : 'demo-player',
        displayName: names[i]!,
        avatarUrl: null,
        count: 0,
        status: 'waiting',
      })),
    };
    if (scene === 'ready') { room.status = 'confirming'; room.readyUntil = Date.now() + 60000; room.searchUntil = null; }
    game = scene === 'game' ? durakTable.createTable(capacity, createRng('preview').next) : null;
    if (game && params.get('layout') === 'busy') {
      const cards = [...game.hands.flat(), ...game.deck];
      const pairs = Math.min(6, Math.max(1, Number(params.get('pairs')) || 6));
      const remaining = cards.slice(pairs * 2);
      game.hands = Array.from({ length: capacity }, (_, i) => remaining.slice(0, capacity * 6).filter((_, j) => j % capacity === i));
      game.deck = remaining.slice(capacity * 6);
      game.table = Array.from({ length: pairs }, (_, i) => ({ attack: cards[i * 2]!, defence: cards[i * 2 + 1]! }));
      game.attacker = 0; game.defender = 1; game.turn = 0; game.phase = 'throw';
      game.throwers = Array.from({ length: capacity }, (_, i) => i).filter(i => i !== 1);
      game.limit = 6;
    }
    if (game) {
      room.status = 'playing';
      room.searchUntil = null;
    }
  };
  make(Number(params.get('seats')) || 5, true);
  let deadline = Date.now() + 40000;
  const get = () => {
    const r = room!;
    if (r.status === 'confirming' && r.readyUntil != null && r.readyUntil <= Date.now()) r.status = 'ended';
    if (r.status === 'countdown' && r.countdownAt !== null && r.countdownAt <= Date.now()) {
      game = durakTable.createTable(r.seats.length, createRng('preview').next);
      r.status = 'playing';
      deadline = Date.now() + 40000;
      r.revision++;
    }
    for (let i = 0; !params.has('freeze') && game && game.phase !== 'ended' && deadline <= Date.now() && i < 100; i++) {
      const action = durakTable.timeout(game);
      if (!action) break;
      game = durakTable.apply(game, game.turn, action);
      deadline += durakTable.turnDuration(game);
      r.revision++;
    }
    r.serverNow = Date.now();
    if (game) {
      r.status = game.phase === 'ended' ? 'ended' : 'playing';
      r.seats = r.seats.map((s, i) => ({
        ...s,
        count: game!.hands[i]!.length,
        status: game!.status[i]!,
      }));
      r.game = {
        player: 0,
        hand: game.hands[0]!,
        deckCount: game.deck.length,
        trump: game.trump,
        trumpCard: game.trumpCard,
        attacker: game.attacker,
        defender: game.defender,
        turn: game.turn,
        table: game.table,
        phase: game.phase,
        taking: game.taking,
        deadline: params.has('freeze') || game.phase === 'ended' ? null : deadline,
        actions: durakTable.legal(game, 0),
        result: game.status[0] === 'playing' ? null : game.status[0]!,
      };
    }
    return r;
  };
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    );
    const path = url.pathname;
    if (path.endsWith('/bar/cards/lobby'))
      return Response.json({ matchId: null, roomId: null, searching: false, invites: [] });
    if (path.endsWith('/bar/cards/players'))
      return Response.json(
        names
          .slice(1)
          .map((displayName, i) => ({ userId: `demo-${i + 1}`, displayName, avatarUrl: null }))
          .filter((p) =>
            p.displayName.toLowerCase().includes((url.searchParams.get('q') ?? '').toLowerCase()),
          ),
      );
    if (path.endsWith('/bar/cards/rooms')) {
      const body = JSON.parse(String(init?.body));
      const formats = Array.isArray(body.capacity) ? body.capacity : [body.capacity];
      make(Math.max(...formats), body.searching);
      room!.formats = formats;
      return Response.json({ roomId: 'demo-room' });
    }
    if (path.includes('/bar/cards/rooms/')) {
      if (path.endsWith('/invites')) {
        const body = JSON.parse(String(init?.body));
        room!.pending.push(body.userId);
        return Response.json({ id: 'demo-invite' });
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        get();
        if (body.revision === room!.revision) {
          const command: RoomCommand = body.command;
          if (command.type === 'move' && game) {
            game = durakTable.apply(game, 0, command.action);
            deadline = Date.now() + durakTable.turnDuration(game);
          } else if (command.type === 'leave') {
            if (game) game = durakTable.surrender(game, 0);
            else {
              room = null;
              return Response.json({ left: true });
            }
          } else if (command.type === 'renew') {
            room!.searchUntil = Date.now() + 120000;
            room!.proposed = false;
            room!.ready = [];
          } else if (command.type === 'pause') room!.searchUntil = null;
          else if (command.type === 'propose') {
            room!.proposed = true;
            room!.ready = ['demo-player'];
          } else if (command.type === 'ready') {
            room!.ready = room!.seats.map((s) => s.userId);
            room!.capacity = room!.seats.length;
            room!.status = 'countdown';
            room!.countdownAt = Date.now() + 5000;
          }
          room!.revision++;
        }
      }
      return Response.json(get());
    }
    return original(input, init);
  };
}
