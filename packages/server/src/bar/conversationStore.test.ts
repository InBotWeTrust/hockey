import { defaultVisitorSettings } from './visitorRules.js';
import type { Pool } from 'pg';
import { expect, it } from 'vitest';
import { SqlConversationStore } from './conversationStore.js';

it('keeps a slow conversation reserved beyond 60 seconds without leaving it busy forever', async () => {
  let now = 0, expiresAt = 0;
  const db = {
    release() {},
    async query(sql: string) {
      if (sql.startsWith('select clock_timestamp')) return {rows:[{at:new Date(now).toISOString()}]};
      if (sql.startsWith('select * from bar_visitor_accounts')) return {rows:[{purchased_at:null,expires_at:null,paid_messages:0,messages_used:0,games_used:{},day_started_at:new Date(0),reset_at:new Date(86400000)}]};
      if (sql.startsWith('select revision,settings')) return {rows:[{revision:1,settings:defaultVisitorSettings}]};
      if (sql.startsWith('insert into bar_visitor_receipts')) return {rows:[{id:'reserved'}]};
      if (sql.startsWith('select revision,turns'))
        return { rows: [{ revision: 0, turns: [], pending: expiresAt > now }] };
      if (sql.startsWith('select 1 from bar_conversations'))
        return { rows: expiresAt > now ? [{}] : [] };
      if (sql.startsWith('insert into bar_conversation_usage')) return { rows: [{ requests: 1 }] };
      if (sql.startsWith('update bar_conversations set pending_id')) {
        const seconds = Number(sql.match(/interval '(\d+) seconds'/)?.[1]);
        expiresAt = now + seconds * 1000;
      }
      return { rows: [] };
    },
  };
  const store = new SqlConversationStore({ connect: async () => db } as unknown as Pool);
  expect((await store.reserve('test-user', 'daria', 'first', 0)).kind).toBe('reserved');
  now = 90000;
  expect((await store.reserve('test-user', 'daria', 'second', 0)).kind).toBe('busy');
  now = 151000;
  expect((await store.reserve('test-user', 'daria', 'second', 0)).kind).toBe('reserved');
});
