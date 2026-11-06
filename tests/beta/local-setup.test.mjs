import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {assertLocalStatus,assertLocalDocker} from '../../scripts/local-supabase.mjs';
import {bootstrapSQL} from '../../scripts/local-supabase-data.mjs';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
const m={organizations:['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'],accounts:ids.map(id=>({id}))};
test('local setup refuses remote targets and non-JWT keys',()=>{
 const local={API_URL:'http://127.0.0.1:54321',ANON_KEY:'a.b.c',SERVICE_ROLE_KEY:'d.e.f'};
 assert.equal(assertLocalStatus(local),local);
 for(const change of [{API_URL:'https://example.supabase.co'},{API_URL:'http://127.0.0.1:9999'},{SERVICE_ROLE_KEY:'secret'},{ANON_KEY:''}]) assert.throws(()=>assertLocalStatus({...local,...change}));
 assert.throws(()=>bootstrapSQL({...m,organizations:["'; drop table x;--",m.organizations[1]]}));
 for(const endpoint of ['ssh://remote','tcp://127.0.0.1:2375','tcp://remote:2376',undefined]) assert.throws(()=>assertLocalDocker(endpoint));
 assert.doesNotThrow(()=>assertLocalDocker('npipe:////./pipe/dockerDesktopLinuxEngine'));
 assert.doesNotThrow(()=>assertLocalDocker('unix:///var/run/docker.sock'));
});
test('local bootstrap reuses migrations and preserves records and changed roles on rerun',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
  for(const id of ids) await db.query('insert into auth.users(id) values($1)',[id]);
  for(const file of ['202610130001_private_beta.sql','20261016040114_stage7_investigations.sql']) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.exec(bootstrapSQL(m));
  await db.query("update public.memberships set role='member' where user_id=$1",[ids[2]]);
  await db.query('update public.workspaces set version=7 where org_id=$1',[m.organizations[0]]);
  await db.exec(bootstrapSQL(m));
  assert.equal((await db.query('select count(*)::int as n from organizations')).rows[0].n,2);
  assert.equal((await db.query('select version from workspaces where org_id=$1',[m.organizations[0]])).rows[0].version,7);
  assert.equal((await db.query('select role from memberships where user_id=$1',[ids[2]])).rows[0].role,'member');
  assert.equal((await db.query('select count(*)::int as n from memberships')).rows[0].n,3);
  await db.query('delete from memberships where user_id=$1',[ids[2]]);
  await db.exec(bootstrapSQL(m));
  assert.equal((await db.query('select count(*)::int as n from memberships')).rows[0].n,2,'removed membership stays removed');
 } finally {await db.close();}
});
