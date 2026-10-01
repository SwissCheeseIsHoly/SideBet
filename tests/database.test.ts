import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import type { Snapshot } from '../src/types'

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006']
const [alice, bob, cara, dan, eve, stranger] = ids
let db: PGlite

async function as(user: string | null) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ''])
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
}
async function rpc(action: string, payload?: Record<string, unknown>): Promise<Snapshot> {
  const result = payload === undefined
    ? await db.query<{ data: Snapshot }>(`select public.sb_${action}() as data`)
    : await db.query<{ data: Snapshot }>(`select public.sb_${action}($1::jsonb) as data`, [JSON.stringify(payload)])
  return result.rows[0].data
}
async function admin(sql: string) { await db.exec('reset role'); return db.exec(sql) }
async function connect(a: string, b: string) {
  await as(b)
  const code = (await rpc('snapshot')).profile.invite_code
  await as(a)
  const snapshot = await rpc('connect_friend', { code })
  const id = snapshot.friendships.find(f => f.sender_id === a && f.recipient_id === b)!.id
  await as(b)
  await rpc('respond_friend', { id, accept: true })
}
async function create(peers = [bob], stake = 40, option = 'Yes') {
  for (const peer of peers) await connect(alice, peer)
  await as(alice)
  const snapshot = await rpc('create_bet', { title: 'Will the home team win?', description: 'The Friday game', category: 'Sports', stake, deadline: new Date(Date.now() + 86_400_000).toISOString(), options: ['Yes', 'No', 'Draw'], option, friend_ids: peers })
  return snapshot.bets[0].id
}
async function join(id: string, user: string, option: string) { await as(user); return rpc('join_bet', { id, option }) }
async function propose(id: string, outcome: string) {
  await as(alice)
  await rpc('lock_bet', { id })
  return rpc('propose_result', { id, outcome, note: 'Final score confirmed' })
}
async function resolvedDebt(stake = 40) {
  const id = await create([bob], stake, 'No')
  await join(id, bob, 'Yes')
  await propose(id, 'Yes')
  await as(bob)
  return { id, snapshot: await rpc('vote_result', { id, approve: true }) }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/202610010001_sidebet.sql', import.meta.url), 'utf8'))
}, 60_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await admin('truncate public.sb_settlement_allocations, public.sb_comments, public.sb_settlements, public.sb_obligations, public.sb_votes, public.sb_participants, public.sb_bets, public.sb_friendships, public.sb_profiles, auth.users cascade')
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2::jsonb)', [ids[i], JSON.stringify({ display_name: ['Alice', 'Bob', 'Cara', 'Dan', 'Eve', 'Stranger'][i], email: 'never-return@example.com' })])
  }
  for (const id of ids) { await as(id); await rpc('snapshot') }
})

describe('Supabase authentication, profile privacy and RPC boundaries', () => {
  it('initializes profiles from safe metadata and never returns emails or other invite codes', async () => {
    await as(alice)
    const snapshot = await rpc('snapshot')
    expect(snapshot.profile.display_name).toBe('Alice')
    expect(snapshot.profile.invite_code).toMatch(/^SB-[A-F0-9]{12}$/)
    expect(snapshot.profiles).toHaveLength(1)
    expect(snapshot.profiles[0]).not.toHaveProperty('invite_code')
    expect(JSON.stringify(snapshot)).not.toContain('@')
    await rpc('update_profile', { display_name: 'Alice A', handle: 'alice_a', bio: 'Friday regular', avatar_color: '#f0a123' })
    const refreshed = await rpc('snapshot')
    expect(refreshed.profile).toMatchObject({ display_name: 'Alice A', handle: 'alice_a', bio: 'Friday regular' })
    expect(refreshed.profile.invite_code).toBe(snapshot.profile.invite_code)
  })
  it('initializes an account even if another user has claimed its generated handle', async () => {
    const newcomer = '11111111-1111-4111-8111-111111111111'
    await as(alice)
    await rpc('update_profile', { display_name: 'Alice', handle: newcomer.replaceAll('-',''), bio: '' })
    await admin('select 1')
    await db.query('insert into auth.users(id) values($1)', [newcomer])
    await as(newcomer)
    const snapshot = await rpc('snapshot')
    expect(snapshot.profile.id).toBe(newcomer)
    expect(snapshot.profile.handle).not.toBe(newcomer.replaceAll('-',''))
    expect(snapshot.profile.display_name).toBe('New friend')
  })
  it('rejects anonymous RPCs and private helper execution', async () => {
    await as(null)
    await expect(rpc('snapshot')).rejects.toThrow(/permission denied/)
    await as(alice)
    await expect(db.query('select public.sb_ensure_profile()')).rejects.toThrow(/permission denied/)
    await expect(db.query('select public.sb_finalize_result($1)', [alice])).rejects.toThrow(/permission denied/)
    await db.query("select set_config('request.jwt.claim.sub','','false')")
    await expect(rpc('snapshot')).rejects.toThrow(/Sign in/)
  })
  it('enforces RLS reads and denies direct writes and invite-code selection', async () => {
    await as(alice)
    const rows = await db.query('select id,display_name from public.sb_profiles')
    expect(rows.rows).toHaveLength(1)
    await expect(db.query('select invite_code from public.sb_profiles')).rejects.toThrow(/permission denied/)
    await expect(db.query("update public.sb_profiles set display_name = 'forged' where id = $1", [alice])).rejects.toThrow(/permission denied/)
    await expect(db.query("insert into public.sb_friendships(sender_id,recipient_id) values($1,$2)", [alice,bob])).rejects.toThrow(/permission denied/)
    await expect(db.query('delete from public.sb_bets')).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.sb_settlement_allocations')).rejects.toThrow(/permission denied/)
  })
  it('allows case-insensitive handles and recipient-only friend approvals, retries declined requests', async () => {
    await as(bob)
    await rpc('update_profile', { display_name: 'Bob', handle: 'bobby', bio: '', avatar_color: '#abcdef' })
    await as(alice)
    const request = await rpc('connect_friend', { code: '@BOBBY' })
    const id = request.friendships[0].id
    expect(request.profiles).toHaveLength(2)
    expect(request.profiles.every(p => !('invite_code' in p))).toBe(true)
    await expect(rpc('respond_friend', { id, accept: true })).rejects.toThrow(/not found/)
    await expect(rpc('connect_friend', { code: 'bobby' })).rejects.toThrow(/already pending/)
    await as(bob)
    await rpc('respond_friend', { id, accept: false })
    await as(alice)
    await rpc('connect_friend', { code: 'bobby' })
    await as(bob)
    await rpc('respond_friend', { id, accept: true })
    await expect(rpc('respond_friend', { id, accept: true })).rejects.toThrow(/already been answered/)
    await as(stranger)
    expect((await rpc('snapshot')).friendships).toHaveLength(0)
  })
  it('validates profile lengths and unique handles', async () => {
    await as(alice)
    await expect(rpc('update_profile', { display_name: 'Alice', handle: 'A!', bio: '' })).rejects.toThrow(/Handle/)
    await rpc('update_profile', { display_name: 'Alice', handle: 'available', bio: '' })
    await as(bob)
    await expect(rpc('update_profile', { display_name: 'Bob', handle: 'AVAILABLE', bio: '' })).rejects.toThrow(/already taken/)
  })
})

describe('Private bets, frozen participation and unanimous resolution', () => {
  it('restricts bets/comments to invitees and only invites accepted friends', async () => {
    await as(alice)
    await expect(rpc('create_bet', { title: 'Test bet', stake: 10, deadline: new Date(Date.now()+60_000).toISOString(), options: ['Yes','No'], option: 'Yes', friend_ids: [bob] })).rejects.toThrow(/accepted friends/)
    const id = await create()
    await as(stranger)
    const snapshot = await rpc('snapshot')
    expect(snapshot.bets).toHaveLength(0)
    expect(snapshot.participants).toHaveLength(0)
    expect((await db.query('select * from public.sb_bets')).rows).toHaveLength(0)
    await expect(rpc('join_bet', { id, option: 'Yes' })).rejects.toThrow(/not found/)
    await expect(rpc('add_comment', { id, body: 'Intruder' })).rejects.toThrow(/Only participants/)
    await as(bob)
    const comment = await rpc('add_comment', { id, body: 'Game on!' })
    expect(comment.comments[0].body).toBe('Game on!')
  })
  it('requires two joined users, host lock, valid choices and freezes choices after lock', async () => {
    const id = await create([bob,cara])
    await expect(rpc('lock_bet', { id })).rejects.toThrow(/two people/)
    await expect(rpc('join_bet', { id, option: 'Invalid' })).rejects.toThrow(/options/)
    await join(id,bob,'No')
    await expect(rpc('lock_bet', { id })).rejects.toThrow(/Only the host/)
    await as(alice)
    await rpc('lock_bet', { id })
    await expect(rpc('cancel_bet', { id })).rejects.toThrow(/Only open/)
    await as(cara)
    await expect(rpc('join_bet', { id, option: 'No' })).rejects.toThrow(/closed/)
    await as(bob)
    await expect(rpc('join_bet', { id, option: 'Yes' })).rejects.toThrow(/closed/)
    await expect(rpc('decline_bet', { id })).rejects.toThrow(/closed/)
  })
  it('supports decline/rejoin before lock and host cancellation while open', async () => {
    const id = await create()
    await expect(rpc('decline_bet', { id })).rejects.toThrow(/host can cancel/)
    await as(bob)
    const declined = await rpc('decline_bet', { id })
    expect(declined.participants.find(p => p.user_id === bob)?.status).toBe('declined')
    await rpc('join_bet', { id, option: 'No' })
    await as(alice)
    const cancelled = await rpc('cancel_bet', { id })
    expect(cancelled.bets[0].status).toBe('cancelled')
    await as(bob)
    await expect(rpc('join_bet', { id, option: 'No' })).rejects.toThrow(/closed/)
  })
  it('can resolve expired bets but rejects late joins and premature result proposals', async () => {
    const id = await create([bob,cara])
    await join(id,bob,'No')
    await expect(rpc('propose_result', { id, outcome: 'Yes' })).rejects.toThrow(/Lock the bet/)
    await admin(`update public.sb_bets set deadline = now() - interval '1 second' where id = '${id}'`)
    await as(cara)
    await expect(rpc('join_bet', { id, option: 'No' })).rejects.toThrow(/closed/)
    await expect(rpc('propose_result', { id, outcome: 'Yes' })).rejects.toThrow(/Only joined/)
    await as(bob)
    const result = await rpc('propose_result', { id, outcome: 'No' })
    expect(result.bets[0].status).toBe('proposed')
  })
  it('clears rejected proposals and creates debt only after all joined users confirm', async () => {
    const id = await create([bob,cara],40,'No')
    await join(id,bob,'Yes')
    await join(id,cara,'Yes')
    const proposed = await propose(id,'Yes')
    expect(proposed.obligations).toHaveLength(0)
    expect(proposed.votes).toHaveLength(1)
    await as(bob)
    const rejected = await rpc('vote_result', { id, approve: false })
    expect(rejected.bets[0]).toMatchObject({ status: 'locked', outcome: null, resolution_note: '' })
    expect(rejected.votes).toHaveLength(0)
    await rpc('propose_result', { id, outcome: 'Yes' })
    await as(cara)
    const partial = await rpc('vote_result', { id, approve: true })
    expect(partial.bets[0].status).toBe('proposed')
    expect(partial.obligations).toHaveLength(0)
    await as(alice)
    const resolved = await rpc('vote_result', { id, approve: true })
    expect(resolved.bets[0].status).toBe('resolved')
    expect(resolved.obligations).toHaveLength(2)
    expect(resolved.obligations.map(o => o.amount)).toEqual([20,20])
    await expect(rpc('vote_result', { id, approve: true })).rejects.toThrow(/no result/)
    expect((await rpc('snapshot')).obligations).toHaveLength(2)
  })
  it('conserves every cent across multiple winners and keeps third-party debts private', async () => {
    const id = await create([bob,cara,dan,eve],1.01,'No')
    await join(id,bob,'Yes'); await join(id,cara,'Yes'); await join(id,dan,'Yes'); await join(id,eve,'No')
    await propose(id,'Yes')
    for (const user of [bob,cara,dan,eve]) { await as(user); await rpc('vote_result', { id, approve: true }) }
    await as(alice)
    const own = (await rpc('snapshot')).obligations
    expect(own).toHaveLength(3)
    expect(Object.fromEntries(own.map(o => [o.creditor_id,o.amount]))).toEqual({ [bob]: .34, [cara]: .34, [dan]: .33 })
    expect(own.reduce((sum,o) => sum + Math.round(o.amount * 100),0)).toBe(101)
    await as(bob)
    const winners = (await rpc('snapshot')).obligations
    expect(winners).toHaveLength(2)
    expect(winners.every(o => o.creditor_id === bob)).toBe(true)
    expect((await db.query('select * from public.sb_obligations')).rows).toHaveLength(2)
    await as(stranger)
    expect((await rpc('snapshot')).obligations).toHaveLength(0)
  })
  it('handles a one-cent stake with more winners than cents without zero-value debts', async () => {
    const id = await create([bob,cara,dan],.01,'No')
    for (const user of [bob,cara,dan]) await join(id,user,'Yes')
    await propose(id,'Yes')
    for (const user of [bob,cara,dan]) { await as(user); await rpc('vote_result', { id, approve: true }) }
    await as(alice)
    const result = await rpc('snapshot')
    expect(result.obligations).toHaveLength(1)
    expect(result.obligations[0]).toMatchObject({ debtor_id: alice, creditor_id: bob, amount: .01, remaining: .01 })
  })
  it.each(['Yes','No'])('creates no debt when everyone chose the same side (outcome %s)', async (outcome) => {
    const id = await create([bob],40,'Yes')
    await join(id,bob,'Yes')
    await propose(id,outcome)
    await as(bob)
    const result = await rpc('vote_result', { id, approve: true })
    expect(result.bets[0].status).toBe('resolved')
    expect(result.obligations).toHaveLength(0)
  })
  it('rejects fractional-cent stakes and duplicate/empty choices', async () => {
    await connect(alice,bob); await as(alice)
    const payload = { title: 'Good test bet', category: 'Everyday', stake: 1.001, deadline: new Date(Date.now()+60_000).toISOString(), options: ['Yes','No'], option: 'Yes', friend_ids: [bob] }
    await expect(rpc('create_bet',payload)).rejects.toThrow(/decimal places/)
    await expect(rpc('create_bet',{ ...payload, stake: 1, options: ['Yes','yes'] })).rejects.toThrow(/distinct options/)
    await expect(rpc('create_bet',{ ...payload, stake: 1, options: ['Yes',''] })).rejects.toThrow(/distinct options/)
  })
})

describe('Settlement reservation and approval accounting', () => {
  it('reserves pending amounts, limits sender to their own debt, and requires creditor approval', async () => {
    await resolvedDebt()
    await as(alice)
    const pending = await rpc('send_settlement', { creditor_id: bob, amount: 25, method: 'Venmo', note: 'Paid you after the game' })
    const id = pending.settlements[0].id
    expect(pending.obligations[0].remaining).toBe(40)
    await expect(rpc('send_settlement', { creditor_id: bob, amount: 16, method: 'Cash' })).rejects.toThrow(/exceeds/)
    await expect(rpc('respond_settlement', { id, accept: true })).rejects.toThrow(/Only the recipient/)
    await as(stranger)
    await expect(rpc('send_settlement', { creditor_id: bob, amount: 1, method: 'Cash' })).rejects.toThrow(/exceeds/)
    await expect(rpc('respond_settlement', { id, accept: true })).rejects.toThrow(/Only the recipient/)
    await as(bob)
    const accepted = await rpc('respond_settlement', { id, accept: true })
    expect(accepted.obligations[0].remaining).toBe(15)
    expect(accepted.settlements[0].status).toBe('accepted')
    await expect(rpc('respond_settlement', { id, accept: true })).rejects.toThrow(/already been answered/)
    expect((await rpc('snapshot')).obligations[0].remaining).toBe(15)
  })
  it('declines without changing debt and releases the reserved amount', async () => {
    await resolvedDebt()
    await as(alice)
    const pending = await rpc('send_settlement', { creditor_id: bob, amount: 40, method: 'Venmo' })
    const id = pending.settlements[0].id
    await as(bob)
    const declined = await rpc('respond_settlement', { id, accept: false })
    expect(declined.obligations[0].remaining).toBe(40)
    expect(declined.settlements[0].status).toBe('declined')
    await expect(rpc('respond_settlement', { id, accept: false })).rejects.toThrow(/already been answered/)
    await as(alice)
    const retry = await rpc('send_settlement', { creditor_id: bob, amount: 40, method: 'Cash' })
    expect(retry.settlements.filter(s => s.status === 'pending')).toHaveLength(1)
  })
  it('allocates accepted credits to the oldest debts and keeps an allocation audit', async () => {
    const first = await resolvedDebt(10)
    // A second bet using the established friendship.
    await as(alice)
    const created = await rpc('create_bet', { title: 'Another game', category: 'Games', stake: 20, deadline: new Date(Date.now()+60_000).toISOString(), options: ['Yes','No'], option: 'No', friend_ids: [bob] })
    const id = created.bets.find(b => b.id !== first.id)!.id
    await join(id,bob,'Yes'); await propose(id,'Yes'); await as(bob); await rpc('vote_result', { id, approve: true })
    await as(alice)
    const pending = await rpc('send_settlement', { creditor_id: bob, amount: 15, method: 'Venmo' })
    await as(bob)
    const accepted = await rpc('respond_settlement', { id: pending.settlements[0].id, accept: true })
    expect(accepted.obligations.find(o => o.bet_id === first.id)?.remaining).toBe(0)
    expect(accepted.obligations.find(o => o.bet_id === id)?.remaining).toBe(15)
    await admin('select 1')
    const audit = await db.query<{ amount: string }>('select amount from public.sb_settlement_allocations order by amount')
    expect(audit.rows.map(r => Number(r.amount))).toEqual([5,10])
  })
  it('allows separate pending notes up to the total and accepts them in either order', async () => {
    await resolvedDebt()
    await as(alice)
    const one = await rpc('send_settlement', { creditor_id: bob, amount: 15, method: 'Cash' })
    const firstId = one.settlements[0].id
    const two = await rpc('send_settlement', { creditor_id: bob, amount: 25, method: 'Venmo' })
    const secondId = two.settlements.find(s => s.id !== firstId)!.id
    await expect(rpc('send_settlement', { creditor_id: bob, amount: .01, method: 'Cash' })).rejects.toThrow(/exceeds/)
    await as(bob)
    await rpc('respond_settlement', { id: secondId, accept: true })
    const result = await rpc('respond_settlement', { id: firstId, accept: true })
    expect(result.obligations[0].remaining).toBe(0)
    expect(result.settlements.every(s => s.status === 'accepted')).toBe(true)
  })
  it('rejects negative and fractional-cent settlement amounts', async () => {
    await resolvedDebt(); await as(alice)
    for (const amount of [-1,0,1.001]) await expect(rpc('send_settlement', { creditor_id: bob, amount, method: 'Cash' })).rejects.toThrow(/positive amount/)
  })
})
