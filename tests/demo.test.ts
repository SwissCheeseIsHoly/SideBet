import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDemoSnapshot, resetDemo, runDemoAction } from '../src/demo';
import type { Snapshot } from '../src/types';

const KEY = 'sidebet_v5_demo';
const VIEWER = 'demo-you';
const map = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => { map.set(key, String(value)); },
  removeItem: (key: string) => { map.delete(key); },
  clear: () => map.clear(),
};
const outstanding = (snapshot: Snapshot, debtor: string, creditor: string) => snapshot.obligations.filter(o => o.debtor_id === debtor && o.creditor_id === creditor).reduce((sum, o) => sum + Math.round(o.remaining * 100), 0) / 100;
const editFixture = (edit: (snapshot: Snapshot) => void) => {
  const snapshot = getDemoSnapshot(); edit(snapshot);
  localStorage.setItem(KEY, JSON.stringify({ version: 1, snapshot }));
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorage);
  localStorage.clear();
  resetDemo();
});

describe('settlement notes and directed balances', () => {
  it('does not change any balance until the creditor accepts a pending note', async () => {
    const before = getDemoSnapshot();
    expect(outstanding(before, 'demo-josh', VIEWER)).toBe(60);
    await runDemoAction('respond_settlement', { id: 'settlement-josh', accept: true });
    const after = getDemoSnapshot();
    expect(after.settlements.find(s => s.id === 'settlement-josh')?.status).toBe('accepted');
    expect(outstanding(after, 'demo-josh', VIEWER)).toBe(20);
    // Josh's debt and Alex's debt remain separate; accepting cannot erase both.
    expect(outstanding(after, VIEWER, 'demo-josh')).toBe(15);
    expect(outstanding(after, VIEWER, 'demo-maya')).toBe(25);
    await expect(runDemoAction('respond_settlement', { id: 'settlement-josh', accept: true })).rejects.toThrow('Only the recipient');
    expect(outstanding(getDemoSnapshot(), 'demo-josh', VIEWER)).toBe(20);
  });

  it('declining a note leaves the debt unchanged', async () => {
    await runDemoAction('respond_settlement', { id: 'settlement-josh', accept: false });
    const snapshot = getDemoSnapshot();
    expect(snapshot.settlements.find(s => s.id === 'settlement-josh')?.status).toBe('declined');
    expect(outstanding(snapshot, 'demo-josh', VIEWER)).toBe(60);
  });

  it('reserves outgoing pending amounts and prevents self-acceptance', async () => {
    await runDemoAction('send_settlement', { creditor_id: 'demo-maya', amount: 20, method: 'Venmo', note: 'Sent after game night' });
    const snapshot = getDemoSnapshot();
    const sent = snapshot.settlements.find(s => s.creditor_id === 'demo-maya')!;
    expect(sent.status).toBe('pending');
    expect(outstanding(snapshot, VIEWER, 'demo-maya')).toBe(25);
    await expect(runDemoAction('send_settlement', { creditor_id: 'demo-maya', amount: 5.01, method: 'Cash' })).rejects.toThrow('exceeds');
    await expect(runDemoAction('respond_settlement', { id: sent.id, accept: true })).rejects.toThrow('Only the recipient');
    await runDemoAction('send_settlement', { creditor_id: 'demo-maya', amount: 5, method: 'Cash' });
    expect(getDemoSnapshot().settlements.filter(s => s.creditor_id === 'demo-maya')).toHaveLength(2);
  });

  it('applies accepted notes to oldest debt first with exact cents', async () => {
    editFixture(snapshot => {
      snapshot.obligations.find(o => o.id === 'debt-pasta')!.remaining = 10.15;
      snapshot.obligations.push({ id: 'debt-newer', bet_id: 'bet-pasta', debtor_id: 'demo-josh', creditor_id: VIEWER, amount: 50, remaining: 50, created_at: new Date().toISOString() });
      snapshot.settlements.find(s => s.id === 'settlement-josh')!.amount = 20.25;
    });
    await runDemoAction('respond_settlement', { id: 'settlement-josh', accept: true });
    const snapshot = getDemoSnapshot();
    expect(snapshot.obligations.find(o => o.id === 'debt-pasta')!.remaining).toBe(0);
    expect(snapshot.obligations.find(o => o.id === 'debt-newer')!.remaining).toBe(39.9);
  });

  it('rejects invalid credit values without partially changing state', async () => {
    const before = getDemoSnapshot();
    for (const value of [0, -1, 1.001, NaN, Infinity, '', 1000000.01]) {
      await expect(runDemoAction('send_settlement', { creditor_id: 'demo-maya', amount: value, method: 'Cash' })).rejects.toThrow('credit amount');
    }
    expect(getDemoSnapshot()).toEqual(before);
  });
});

describe('bets and participant consent', () => {
  const input = () => ({ title: 'Who wins game night?', description: 'First to three rounds.', category: 'Game night', stake: 12.5, deadline: new Date(Date.now() + 86400000).toISOString(), options: ['Alex', 'Josh'], option: 'Alex', friend_ids: ['demo-josh', 'demo-josh'] });

  it('creates one host participation and one invitation per friend, preserving profile identity', async () => {
    await runDemoAction('update_profile', { display_name: 'Alex Updated', handle: 'alex_updated', bio: 'Ready to play.', avatar_color: '#00aaff' });
    await runDemoAction('create_bet', input());
    const snapshot = getDemoSnapshot();
    const bet = snapshot.bets[0];
    expect(bet.creator_id).toBe(snapshot.profile.id);
    expect(snapshot.profiles.find(p => p.id === VIEWER)).toEqual(snapshot.profile);
    expect(snapshot.participants.filter(p => p.bet_id === bet.id)).toEqual([
      { bet_id: bet.id, user_id: VIEWER, option: 'Alex', status: 'joined' },
      { bet_id: bet.id, user_id: 'demo-josh', option: null, status: 'invited' },
    ]);
    await expect(runDemoAction('lock_bet', { id: bet.id })).rejects.toThrow('At least two');
  });

  it('joins and changes a pick before the deadline without duplicate participants', async () => {
    await runDemoAction('join_bet', { id: 'bet-trivia', option: 'Top 3, easily' });
    await runDemoAction('join_bet', { id: 'bet-trivia', option: 'There’s always next week' });
    const mine = getDemoSnapshot().participants.filter(p => p.bet_id === 'bet-trivia' && p.user_id === VIEWER);
    expect(mine).toEqual([{ bet_id: 'bet-trivia', user_id: VIEWER, option: 'There’s always next week', status: 'joined' }]);
    await runDemoAction('decline_bet', { id: 'bet-trivia' });
    expect(getDemoSnapshot().participants.find(p => p.bet_id === 'bet-trivia' && p.user_id === VIEWER)?.status).toBe('declined');
  });

  it('cannot silently resolve a new proposal on behalf of friends', async () => {
    await runDemoAction('lock_bet', { id: 'bet-pickleball' });
    await runDemoAction('propose_result', { id: 'bet-pickleball', outcome: 'Team Alex', note: 'Two games to one.' });
    let snapshot = getDemoSnapshot();
    expect(snapshot.bets.find(b => b.id === 'bet-pickleball')?.status).toBe('proposed');
    expect(snapshot.votes.filter(v => v.bet_id === 'bet-pickleball')).toEqual([{ bet_id: 'bet-pickleball', user_id: VIEWER, approved: true }]);
    await runDemoAction('vote_result', { id: 'bet-pickleball', approve: true });
    snapshot = getDemoSnapshot();
    expect(snapshot.bets.find(b => b.id === 'bet-pickleball')?.status).toBe('proposed');
    expect(snapshot.obligations.filter(o => o.bet_id === 'bet-pickleball')).toHaveLength(0);
  });

  it('creates obligations only after the final participant approves', async () => {
    await runDemoAction('vote_result', { id: 'bet-puzzle', approve: true });
    const snapshot = getDemoSnapshot();
    expect(snapshot.bets.find(b => b.id === 'bet-puzzle')?.status).toBe('resolved');
    expect(snapshot.obligations.filter(o => o.bet_id === 'bet-puzzle')).toMatchObject([{ debtor_id: 'demo-sam', creditor_id: VIEWER, amount: 5, remaining: 5 }]);
    await expect(runDemoAction('vote_result', { id: 'bet-puzzle', approve: true })).rejects.toThrow('no pending result');
    expect(getDemoSnapshot().obligations.filter(o => o.bet_id === 'bet-puzzle')).toHaveLength(1);
  });

  it('disputing returns the bet to locked, clears confirmations, and creates no debt', async () => {
    await runDemoAction('vote_result', { id: 'bet-puzzle', approve: false });
    const snapshot = getDemoSnapshot();
    expect(snapshot.bets.find(b => b.id === 'bet-puzzle')).toMatchObject({ status: 'locked', outcome: null, resolution_note: '' });
    expect(snapshot.votes.filter(v => v.bet_id === 'bet-puzzle')).toHaveLength(0);
    expect(snapshot.obligations.filter(o => o.bet_id === 'bet-puzzle')).toHaveLength(0);
  });

  it('assigns remainder cents deterministically and never creates zero-value obligations', async () => {
    editFixture(snapshot => { snapshot.bets.find(b => b.id === 'bet-puzzle')!.stake = 0.01; });
    await runDemoAction('vote_result', { id: 'bet-puzzle', approve: true });
    // Maya sorts before the viewer and receives the lone cent. The viewer's
    // private snapshot therefore has no obligation from this bet.
    expect(getDemoSnapshot().obligations.filter(o => o.bet_id === 'bet-puzzle')).toHaveLength(0);
  });

  it('requires an accepted friendship and valid picks to create a bet', async () => {
    await expect(runDemoAction('create_bet', { ...input(), friend_ids: ['demo-riley'] })).rejects.toThrow('connected friends');
    await expect(runDemoAction('create_bet', { ...input(), options: ['Yes', 'yes'] })).rejects.toThrow('different');
    await expect(runDemoAction('create_bet', { ...input(), option: 'Someone else' })).rejects.toThrow('Choose one');
    await expect(runDemoAction('create_bet', { ...input(), deadline: new Date(Date.now() - 1).toISOString() })).rejects.toThrow('future');
  });

  it('allows only a host to cancel and keeps cancelled bets closed', async () => {
    await expect(runDemoAction('cancel_bet', { id: 'bet-trivia' })).rejects.toThrow('Only the host');
    await runDemoAction('cancel_bet', { id: 'bet-pickleball' });
    await expect(runDemoAction('join_bet', { id: 'bet-pickleball', option: 'Team Josh' })).rejects.toThrow('Picks are closed');
    expect(getDemoSnapshot().bets.find(b => b.id === 'bet-pickleball')?.status).toBe('cancelled');
  });
});

describe('profiles, friends, comments, and persistence', () => {
  it('accepts incoming friendship and enables inviting that friend', async () => {
    await runDemoAction('respond_friend', { id: 'friend-riley', accept: true });
    expect(getDemoSnapshot().friendships.find(f => f.id === 'friend-riley')?.status).toBe('accepted');
    await expect(runDemoAction('connect_friend', { code: '@RILEYB' })).rejects.toThrow('already connected');
  });

  it('can resend a declined connection without accepting for the other person', async () => {
    await runDemoAction('respond_friend', { id: 'friend-riley', accept: false });
    await runDemoAction('connect_friend', { code: 'riley9' });
    expect(getDemoSnapshot().friendships.find(f => f.id === 'friend-riley')).toMatchObject({ sender_id: VIEWER, recipient_id: 'demo-riley', status: 'pending' });
    await expect(runDemoAction('respond_friend', { id: 'friend-riley', accept: true })).rejects.toThrow('Only the recipient');
  });

  it('saves viewer comments and edits in isolated demo storage', async () => {
    localStorage.setItem('sidebet_real_session', 'untouched');
    await runDemoAction('add_comment', { id: 'bet-trivia', body: '  I’ll be there!  ' });
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.snapshot.comments.at(-1)).toMatchObject({ bet_id: 'bet-trivia', user_id: VIEWER, body: 'I’ll be there!' });
    expect(localStorage.getItem('sidebet_real_session')).toBe('untouched');
    const snapshot = getDemoSnapshot();
    snapshot.profile.display_name = 'External mutation';
    expect(getDemoSnapshot().profile.display_name).toBe('Alex Morgan');
  });

  it('rejects duplicate handles and resets only demo data', async () => {
    await expect(runDemoAction('update_profile', { display_name: 'Alex', handle: 'joshchen', bio: '', avatar_color: '#aabbcc' })).rejects.toThrow('already in use');
    await runDemoAction('respond_settlement', { id: 'settlement-josh', accept: true });
    localStorage.setItem('unrelated', 'keep');
    resetDemo();
    expect(outstanding(getDemoSnapshot(), 'demo-josh', VIEWER)).toBe(60);
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
