import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readCardRoom} from './durakRooms.js';
const url=process.env.TEST_DATABASE_URL,schema='card_invite_'+randomUUID().replaceAll('-','');
let admin:Pool,db:Pool;
const owner=randomUUID(),target=randomUUID(),room=randomUUID(),invite=randomUUID();
beforeAll(async()=>{
 if(!url)return;
 const u=new URL(url);if(!['localhost','127.0.0.1'].includes(u.hostname)||!u.pathname.includes('test'))throw new Error('Dedicated local test database required');
 admin=new Pool({connectionString:url});await admin.query(`create schema "${schema}"`);
 db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 await db.query(`create table users(id uuid primary key,display_name text,avatar_url text);
 create table bar_card_rooms(id uuid primary key,data jsonb);
 create table bar_card_queue(expires_at timestamptz);
 create table bar_card_invites(id uuid primary key,receiver_id uuid,room_id uuid,status text,expires_at timestamptz,created_at timestamptz default now());`);
 await db.query('insert into users values($1,$2,null),($3,$4,$5)',[owner,'Owner',target,'Invited','/invited-avatar.png']);
 await db.query('insert into bar_card_rooms values($1,$2)',[room,JSON.stringify({seats:[owner],owner,capacity:2,status:'waiting',searchUntil:null,countdownAt:null,proposed:false,ready:[],revision:1,game:null,deadline:null})]);
 await db.query("insert into bar_card_invites(id,receiver_id,room_id,status,expires_at) values($1,$2,$3,'pending',now()+interval '1 hour')",[invite,target,room]);
});
afterAll(async()=>{if(db)await db.end();if(admin){await admin.query(`drop schema "${schema}" cascade`);await admin.end();}});
it.skipIf(!url)('returns the invited avatar only through the member-scoped room snapshot',async()=>{
 const view=await readCardRoom(db,owner,room);
 expect(view.invitations).toEqual([{id:invite,userId:target,displayName:'Invited',avatarUrl:'/invited-avatar.png'}]);
 await expect(readCardRoom(db,target,room)).rejects.toThrow('Стол не найден.');
});
