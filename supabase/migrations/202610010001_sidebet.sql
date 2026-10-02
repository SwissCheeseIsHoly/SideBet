-- SideBet: private, credit-only bets. Apply once using the Supabase SQL editor.
-- No email addresses or authentication secrets are stored in public tables.
begin;

create table public.sb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_color text not null default '#a3e635' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  invite_code text not null unique default 'SB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,12)),
  created_at timestamptz not null default now()
);
create table public.sb_friendships (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.sb_profiles(id),
  recipient_id uuid not null references public.sb_profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index sb_friendships_pair on public.sb_friendships (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create table public.sb_bets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.sb_profiles(id),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null check (char_length(category) between 1 and 40),
  stake numeric(12,2) not null check (stake > 0 and stake <= 1000000),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open','locked','proposed','resolved','cancelled')),
  options text[] not null check (cardinality(options) between 2 and 8),
  outcome text,
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  check (outcome is null or outcome = any(options))
);
create table public.sb_participants (
  bet_id uuid not null references public.sb_bets(id) on delete cascade,
  user_id uuid not null references public.sb_profiles(id),
  option text,
  status text not null default 'invited' check (status in ('invited','joined','declined')),
  primary key (bet_id,user_id),
  check ((status = 'joined' and option is not null) or status <> 'joined')
);
create table public.sb_votes (
  bet_id uuid not null references public.sb_bets(id) on delete cascade,
  user_id uuid not null references public.sb_profiles(id),
  approved boolean not null,
  primary key (bet_id,user_id)
);
create table public.sb_obligations (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.sb_bets(id),
  debtor_id uuid not null references public.sb_profiles(id),
  creditor_id uuid not null references public.sb_profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  remaining numeric(12,2) not null check (remaining >= 0 and remaining <= amount),
  created_at timestamptz not null default now(),
  unique (bet_id,debtor_id,creditor_id),
  check (debtor_id <> creditor_id)
);
create table public.sb_settlements (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references public.sb_profiles(id),
  creditor_id uuid not null references public.sb_profiles(id),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  method text not null check (char_length(method) between 1 and 60),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (debtor_id <> creditor_id)
);
create table public.sb_settlement_allocations (
  settlement_id uuid not null references public.sb_settlements(id),
  obligation_id uuid not null references public.sb_obligations(id),
  amount numeric(12,2) not null check (amount > 0),
  primary key (settlement_id,obligation_id)
);
create table public.sb_comments (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.sb_bets(id) on delete cascade,
  user_id uuid not null references public.sb_profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index sb_participants_user on public.sb_participants(user_id,bet_id);
create index sb_obligations_pair on public.sb_obligations(debtor_id,creditor_id,created_at);
create index sb_settlements_pair on public.sb_settlements(debtor_id,creditor_id,status);
create index sb_comments_bet on public.sb_comments(bet_id,created_at);

-- Every helper has a fixed search_path and is callable only by the function owner.
create function public.sb_require_user() returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  return uid;
end $$;

create function public.sb_ensure_profile() returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_require_user(); meta jsonb; display text; generated_handle text := replace(uid::text,'-',''); attempts integer := 0;
begin
  if not exists(select 1 from public.sb_profiles where id = uid) then
    select raw_user_meta_data into meta from auth.users where id = uid;
    if not found then raise exception 'Account not found.'; end if;
    display := left(coalesce(nullif(btrim(meta->>'display_name'),''), nullif(btrim(meta->>'name'),''), 'New friend'),60);
    loop
      begin
        insert into public.sb_profiles(id,display_name,handle) values(uid,display,generated_handle) on conflict(id) do nothing;
        exit;
      exception when unique_violation then
        -- A previously chosen custom handle (or a rare invite-code collision) must not block signup.
        attempts := attempts + 1;
        if attempts >= 5 then raise exception 'Could not create your profile. Please try again.'; end if;
        generated_handle := replace(gen_random_uuid()::text,'-','');
      end;
    end loop;
  end if;
  return uid;
end $$;

create function public.sb_can_see_bet(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists(select 1 from public.sb_participants where bet_id = target and user_id = auth.uid());
$$;
create function public.sb_can_see_profile(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (target = auth.uid()
    or exists(select 1 from public.sb_friendships where (sender_id = auth.uid() and recipient_id = target) or (recipient_id = auth.uid() and sender_id = target))
    or exists(select 1 from public.sb_participants a join public.sb_participants b on a.bet_id = b.bet_id where a.user_id = auth.uid() and b.user_id = target)
    or exists(select 1 from public.sb_obligations where (debtor_id = auth.uid() and creditor_id = target) or (creditor_id = auth.uid() and debtor_id = target)));
$$;

alter table public.sb_profiles enable row level security;
alter table public.sb_friendships enable row level security;
alter table public.sb_bets enable row level security;
alter table public.sb_participants enable row level security;
alter table public.sb_votes enable row level security;
alter table public.sb_obligations enable row level security;
alter table public.sb_settlements enable row level security;
alter table public.sb_settlement_allocations enable row level security;
alter table public.sb_comments enable row level security;
create policy sb_profiles_read on public.sb_profiles for select to authenticated using (public.sb_can_see_profile(id));
create policy sb_friendships_read on public.sb_friendships for select to authenticated using (auth.uid() in (sender_id,recipient_id));
create policy sb_bets_read on public.sb_bets for select to authenticated using (public.sb_can_see_bet(id));
create policy sb_participants_read on public.sb_participants for select to authenticated using (public.sb_can_see_bet(bet_id));
create policy sb_votes_read on public.sb_votes for select to authenticated using (public.sb_can_see_bet(bet_id));
create policy sb_obligations_read on public.sb_obligations for select to authenticated using (auth.uid() in (debtor_id,creditor_id));
create policy sb_settlements_read on public.sb_settlements for select to authenticated using (auth.uid() in (debtor_id,creditor_id));
create policy sb_comments_read on public.sb_comments for select to authenticated using (public.sb_can_see_bet(bet_id));

create function public.sb_snapshot() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); result jsonb;
begin
  select jsonb_build_object(
    'profile',(select to_jsonb(p) - 'created_at' from public.sb_profiles p where p.id = uid),
    'profiles',coalesce((select jsonb_agg(to_jsonb(p) - 'invite_code' - 'created_at' order by p.display_name) from public.sb_profiles p where public.sb_can_see_profile(p.id)), '[]'::jsonb),
    'friendships',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.sb_friendships f where uid in (f.sender_id,f.recipient_id)), '[]'::jsonb),
    'bets',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id) from public.sb_bets b where public.sb_can_see_bet(b.id)), '[]'::jsonb),
    'participants',coalesce((select jsonb_agg(to_jsonb(p)) from public.sb_participants p where public.sb_can_see_bet(p.bet_id)), '[]'::jsonb),
    'votes',coalesce((select jsonb_agg(to_jsonb(v)) from public.sb_votes v where public.sb_can_see_bet(v.bet_id)), '[]'::jsonb),
    'obligations',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at,o.id) from public.sb_obligations o where uid in (o.debtor_id,o.creditor_id)), '[]'::jsonb),
    'settlements',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id) from public.sb_settlements s where uid in (s.debtor_id,s.creditor_id)), '[]'::jsonb),
    'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.sb_comments c where public.sb_can_see_bet(c.bet_id)), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.sb_update_profile(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); display text := btrim(payload->>'display_name'); handle_value text := lower(btrim(payload->>'handle')); bio_value text := btrim(coalesce(payload->>'bio','')); color_value text := coalesce(payload->>'avatar_color','#a3e635');
begin
  if display is null or char_length(display) not between 1 and 60 then raise exception 'Name must be 1–60 characters.'; end if;
  if handle_value is null or handle_value !~ '^[a-z0-9_]{3,32}$' then raise exception 'Handle must be 3–32 letters, numbers, or underscores.'; end if;
  if char_length(bio_value) > 240 then raise exception 'Bio must be at most 240 characters.'; end if;
  if color_value !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Choose a valid avatar color.'; end if;
  update public.sb_profiles set display_name = display, handle = handle_value, bio = bio_value, avatar_color = color_value where id = uid;
  return public.sb_snapshot();
exception when unique_violation then raise exception 'That handle is already taken.';
end $$;

create function public.sb_connect_friend(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); target uuid; code text := ltrim(btrim(payload->>'code'),'@'); friendship public.sb_friendships;
begin
  select id into target from public.sb_profiles where lower(handle) = lower(code) or upper(invite_code) = upper(code) limit 1;
  if target is null then raise exception 'No friend found with that code or handle.'; end if;
  if target = uid then raise exception 'That is your own friend code.'; end if;
  -- Serialize both directions of requests for this pair.
  perform pg_advisory_xact_lock(hashtextextended(least(uid,target)::text || greatest(uid,target)::text,0));
  select * into friendship from public.sb_friendships where least(sender_id,recipient_id) = least(uid,target) and greatest(sender_id,recipient_id) = greatest(uid,target) for update;
  if found and friendship.status = 'accepted' then raise exception 'You are already friends.'; end if;
  if found and friendship.status = 'pending' then raise exception 'A friend request is already pending. Check your requests.'; end if;
  if friendship.id is not null then
    update public.sb_friendships set sender_id = uid, recipient_id = target, status = 'pending', created_at = now() where id = friendship.id;
  else
    insert into public.sb_friendships(sender_id,recipient_id) values(uid,target);
  end if;
  return public.sb_snapshot();
end $$;
create function public.sb_respond_friend(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); friendship public.sb_friendships; accept_value boolean := (payload->>'accept')::boolean;
begin
  if accept_value is null then raise exception 'Choose accept or decline.'; end if;
  select * into friendship from public.sb_friendships where id = (payload->>'id')::uuid for update;
  if not found or friendship.recipient_id <> uid then raise exception 'Friend request not found.'; end if;
  if friendship.status <> 'pending' then raise exception 'This request has already been answered.'; end if;
  update public.sb_friendships set status = case when accept_value then 'accepted' else 'declined' end where id = friendship.id;
  return public.sb_snapshot();
end $$;

create function public.sb_create_bet(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bid uuid; title_value text := btrim(payload->>'title'); description_value text := btrim(coalesce(payload->>'description','')); category_value text := btrim(coalesce(payload->>'category','Everyday')); stake_value numeric := (payload->>'stake')::numeric; deadline_value timestamptz := (payload->>'deadline')::timestamptz; choices text[]; peers uuid[]; peer uuid; choice text := payload->>'option';
begin
  if title_value is null or char_length(title_value) not between 3 and 120 then raise exception 'Title must be 3–120 characters.'; end if;
  if char_length(description_value) > 1000 then raise exception 'Description must be at most 1,000 characters.'; end if;
  if char_length(category_value) not between 1 and 40 then raise exception 'Choose a category.'; end if;
  if stake_value is null or stake_value <= 0 or stake_value > 1000000 or stake_value <> round(stake_value,2) then raise exception 'Stake must be 0.01–1,000,000 credits, with at most two decimal places.'; end if;
  if deadline_value is null or not isfinite(deadline_value) or deadline_value <= now() or deadline_value > now() + interval '1 year' then raise exception 'Choose a future deadline within one year.'; end if;
  if jsonb_typeof(payload->'options') is distinct from 'array' or jsonb_typeof(payload->'friend_ids') is distinct from 'array' then raise exception 'Choose options and invite friends.'; end if;
  select array_agg(btrim(value)) into choices from jsonb_array_elements_text(payload->'options');
  if cardinality(choices) is null or cardinality(choices) not between 2 and 8 or exists(select 1 from unnest(choices) c where c is null or char_length(c) not between 1 and 60) or (select count(distinct lower(c)) from unnest(choices) c) <> cardinality(choices) then raise exception 'Add 2–8 distinct options, each 1–60 characters.'; end if;
  if choice is null or not(choice = any(choices)) then raise exception 'Choose one of the bet options.'; end if;
  select array_agg(distinct value::uuid) into peers from jsonb_array_elements_text(payload->'friend_ids');
  if cardinality(peers) is null or cardinality(peers) not between 1 and 30 then raise exception 'Invite between 1 and 30 friends.'; end if;
  foreach peer in array peers loop
    if peer is null or peer = uid or not exists(select 1 from public.sb_friendships where status = 'accepted' and ((sender_id = uid and recipient_id = peer) or (recipient_id = uid and sender_id = peer))) then raise exception 'You can only invite accepted friends.'; end if;
  end loop;
  insert into public.sb_bets(creator_id,title,description,category,stake,deadline,options) values(uid,title_value,description_value,category_value,stake_value,deadline_value,choices) returning id into bid;
  insert into public.sb_participants(bet_id,user_id,option,status) values(bid,uid,choice,'joined');
  insert into public.sb_participants(bet_id,user_id) select bid,unnest(peers);
  return public.sb_snapshot();
end $$;

create function public.sb_join_bet(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets; choice text := payload->>'option';
begin
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or not public.sb_can_see_bet(bet.id) then raise exception 'Bet not found.'; end if;
  if bet.status <> 'open' or bet.deadline <= now() then raise exception 'This bet is closed to new picks.'; end if;
  if choice is null or not(choice = any(bet.options)) then raise exception 'Choose one of the bet options.'; end if;
  update public.sb_participants set option = choice, status = 'joined' where bet_id = bet.id and user_id = uid;
  return public.sb_snapshot();
end $$;
create function public.sb_decline_bet(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets;
begin
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or not public.sb_can_see_bet(bet.id) then raise exception 'Bet not found.'; end if;
  if bet.status <> 'open' or bet.deadline <= now() then raise exception 'This bet is closed to changes.'; end if;
  if bet.creator_id = uid then raise exception 'The host can cancel the open bet instead.'; end if;
  update public.sb_participants set option = null, status = 'declined' where bet_id = bet.id and user_id = uid;
  return public.sb_snapshot();
end $$;
create function public.sb_lock_bet(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets;
begin
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or bet.creator_id <> uid then raise exception 'Only the host can lock this bet.'; end if;
  if bet.status <> 'open' then raise exception 'This bet is no longer open.'; end if;
  if (select count(*) from public.sb_participants where bet_id = bet.id and status = 'joined') < 2 then raise exception 'At least two people must join before locking.'; end if;
  update public.sb_bets set status = 'locked' where id = bet.id;
  return public.sb_snapshot();
end $$;
create function public.sb_cancel_bet(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets;
begin
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or bet.creator_id <> uid then raise exception 'Only the host can cancel this bet.'; end if;
  if bet.status <> 'open' then raise exception 'Only open bets can be cancelled.'; end if;
  update public.sb_bets set status = 'cancelled' where id = bet.id;
  return public.sb_snapshot();
end $$;

-- The calling RPC holds the bet row lock. Integer cent arithmetic preserves every stake.
create function public.sb_finalize_result(bid uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare bet public.sb_bets; winner_count bigint; stake_cents bigint;
begin
  select * into bet from public.sb_bets where id = bid for update;
  if bet.status <> 'proposed' then return; end if;
  if exists(select 1 from public.sb_participants p where p.bet_id = bid and p.status = 'joined' and not exists(select 1 from public.sb_votes v where v.bet_id = bid and v.user_id = p.user_id and v.approved)) then return; end if;
  select count(*) into winner_count from public.sb_participants where bet_id = bid and status = 'joined' and option = bet.outcome;
  stake_cents := (bet.stake * 100)::bigint;
  if winner_count > 0 then
    insert into public.sb_obligations(bet_id,debtor_id,creditor_id,amount,remaining)
    select bid,loser.user_id,winner.user_id,
      (stake_cents / winner_count + case when winner.position <= stake_cents % winner_count then 1 else 0 end)::numeric / 100,
      (stake_cents / winner_count + case when winner.position <= stake_cents % winner_count then 1 else 0 end)::numeric / 100
    from public.sb_participants loser
    cross join (select user_id,row_number() over(order by user_id) as position from public.sb_participants where bet_id = bid and status = 'joined' and option = bet.outcome) winner
    where loser.bet_id = bid and loser.status = 'joined' and loser.option <> bet.outcome
      and (stake_cents / winner_count + case when winner.position <= stake_cents % winner_count then 1 else 0 end) > 0;
  end if;
  update public.sb_bets set status = 'resolved' where id = bid;
end $$;
create function public.sb_propose_result(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets; result text := payload->>'outcome'; note_value text := btrim(coalesce(payload->>'note',''));
begin
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or not exists(select 1 from public.sb_participants where bet_id = bet.id and user_id = uid and status = 'joined') then raise exception 'Only joined participants can propose a result.'; end if;
  if not (bet.status = 'locked' or (bet.status = 'open' and bet.deadline <= now())) then raise exception 'Lock the bet or wait for its deadline before proposing a result.'; end if;
  if (select count(*) from public.sb_participants where bet_id = bet.id and status = 'joined') < 2 then raise exception 'At least two people must join before resolving.'; end if;
  if result is null or not(result = any(bet.options)) then raise exception 'Choose a valid outcome.'; end if;
  if char_length(note_value) > 1000 then raise exception 'Result note must be at most 1,000 characters.'; end if;
  delete from public.sb_votes where bet_id = bet.id;
  update public.sb_bets set status = 'proposed', outcome = result, resolution_note = note_value where id = bet.id;
  insert into public.sb_votes(bet_id,user_id,approved) values(bet.id,uid,true);
  perform public.sb_finalize_result(bet.id);
  return public.sb_snapshot();
end $$;
create function public.sb_vote_result(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bet public.sb_bets; approve_value boolean := (payload->>'approve')::boolean;
begin
  if approve_value is null then raise exception 'Choose confirm or dispute.'; end if;
  select * into bet from public.sb_bets where id = (payload->>'id')::uuid for update;
  if not found or not exists(select 1 from public.sb_participants where bet_id = bet.id and user_id = uid and status = 'joined') then raise exception 'Only joined participants can confirm a result.'; end if;
  if bet.status <> 'proposed' then raise exception 'There is no result awaiting confirmation.'; end if;
  if not approve_value then
    update public.sb_bets set status = 'locked', outcome = null, resolution_note = '' where id = bet.id;
    delete from public.sb_votes where bet_id = bet.id;
  else
    insert into public.sb_votes(bet_id,user_id,approved) values(bet.id,uid,true) on conflict(bet_id,user_id) do update set approved = true;
    perform public.sb_finalize_result(bet.id);
  end if;
  return public.sb_snapshot();
end $$;

create function public.sb_send_settlement(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); creditor uuid := (payload->>'creditor_id')::uuid; amount_value numeric := (payload->>'amount')::numeric; method_value text := btrim(payload->>'method'); note_value text := btrim(coalesce(payload->>'note','')); available numeric;
begin
  if creditor is null or creditor = uid then raise exception 'Choose someone you owe credits.'; end if;
  if amount_value is null or amount_value <= 0 or amount_value > 1000000 or amount_value <> round(amount_value,2) then raise exception 'Enter a positive amount with at most two decimal places.'; end if;
  if method_value is null or char_length(method_value) not between 1 and 60 then raise exception 'Add how you settled up.'; end if;
  if char_length(note_value) > 500 then raise exception 'Note must be at most 500 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || creditor::text,1));
  select coalesce((select sum(remaining) from public.sb_obligations where debtor_id = uid and creditor_id = creditor),0) - coalesce((select sum(amount) from public.sb_settlements where debtor_id = uid and creditor_id = creditor and status = 'pending'),0) into available;
  if amount_value > available then raise exception 'Amount exceeds the credits you owe, excluding pending settlement notes.'; end if;
  insert into public.sb_settlements(debtor_id,creditor_id,amount,method,note) values(uid,creditor,amount_value,method_value,note_value);
  return public.sb_snapshot();
end $$;
create function public.sb_respond_settlement(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); settlement public.sb_settlements; accept_value boolean := (payload->>'accept')::boolean; debt public.sb_obligations; unallocated numeric; applied numeric;
begin
  if accept_value is null then raise exception 'Choose accept or decline.'; end if;
  select * into settlement from public.sb_settlements where id = (payload->>'id')::uuid for update;
  if not found or settlement.creditor_id <> uid then raise exception 'Only the recipient can respond to this settlement note.'; end if;
  if settlement.status <> 'pending' then raise exception 'This settlement note has already been answered.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(settlement.debtor_id::text || settlement.creditor_id::text,1));
  if accept_value then
    unallocated := settlement.amount;
    for debt in select * from public.sb_obligations where debtor_id = settlement.debtor_id and creditor_id = uid and remaining > 0 order by created_at,id for update loop
      applied := least(unallocated,debt.remaining);
      update public.sb_obligations set remaining = remaining - applied where id = debt.id;
      insert into public.sb_settlement_allocations(settlement_id,obligation_id,amount) values(settlement.id,debt.id,applied);
      unallocated := unallocated - applied;
      exit when unallocated = 0;
    end loop;
    if unallocated <> 0 then raise exception 'Outstanding credits changed. This note could not be accepted.'; end if;
  end if;
  update public.sb_settlements set status = case when accept_value then 'accepted' else 'declined' end where id = settlement.id;
  return public.sb_snapshot();
end $$;
create function public.sb_add_comment(payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public.sb_ensure_profile(); bid uuid := (payload->>'id')::uuid; body_value text := btrim(payload->>'body');
begin
  if not public.sb_can_see_bet(bid) then raise exception 'Only participants can comment on this bet.'; end if;
  if body_value is null or char_length(body_value) not between 1 and 1000 then raise exception 'Comment must be 1–1,000 characters.'; end if;
  insert into public.sb_comments(bet_id,user_id,body) values(bid,uid,body_value);
  return public.sb_snapshot();
end $$;

-- Default Supabase privileges may grant public tables/functions more broadly.
-- Revoke explicitly, then grant only public profile columns and RLS-protected reads.
revoke all on public.sb_profiles, public.sb_friendships, public.sb_bets, public.sb_participants, public.sb_votes, public.sb_obligations, public.sb_settlements, public.sb_settlement_allocations, public.sb_comments from public, anon, authenticated;
grant select(id,display_name,handle,bio,avatar_color) on public.sb_profiles to authenticated;
grant select on public.sb_friendships, public.sb_bets, public.sb_participants, public.sb_votes, public.sb_obligations, public.sb_settlements, public.sb_comments to authenticated;
revoke all on function public.sb_require_user(), public.sb_ensure_profile(), public.sb_can_see_bet(uuid), public.sb_can_see_profile(uuid), public.sb_finalize_result(uuid), public.sb_snapshot(), public.sb_update_profile(jsonb), public.sb_connect_friend(jsonb), public.sb_respond_friend(jsonb), public.sb_create_bet(jsonb), public.sb_join_bet(jsonb), public.sb_decline_bet(jsonb), public.sb_lock_bet(jsonb), public.sb_cancel_bet(jsonb), public.sb_propose_result(jsonb), public.sb_vote_result(jsonb), public.sb_send_settlement(jsonb), public.sb_respond_settlement(jsonb), public.sb_add_comment(jsonb) from public, anon, authenticated;
grant execute on function public.sb_can_see_bet(uuid), public.sb_can_see_profile(uuid), public.sb_snapshot(), public.sb_update_profile(jsonb), public.sb_connect_friend(jsonb), public.sb_respond_friend(jsonb), public.sb_create_bet(jsonb), public.sb_join_bet(jsonb), public.sb_decline_bet(jsonb), public.sb_lock_bet(jsonb), public.sb_cancel_bet(jsonb), public.sb_propose_result(jsonb), public.sb_vote_result(jsonb), public.sb_send_settlement(jsonb), public.sb_respond_settlement(jsonb), public.sb_add_comment(jsonb) to authenticated;
commit;
