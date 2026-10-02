-- Transactional live smoke test. Creates only temporary test identities and
-- rolls back every row at the end. No passwords, emails, or messages are sent.
begin;
select set_config('sidebet.test_a',gen_random_uuid()::text,true);
select set_config('sidebet.test_b',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,raw_user_meta_data)
values (current_setting('sidebet.test_a')::uuid,'authenticated','authenticated','{"display_name":"SideBet verification A"}'),
       (current_setting('sidebet.test_b')::uuid,'authenticated','authenticated','{"display_name":"SideBet verification B"}');
set local role authenticated;
do $$
declare a uuid:=current_setting('sidebet.test_a')::uuid; b uuid:=current_setting('sidebet.test_b')::uuid;
  s jsonb; code text; fid uuid; bid uuid; sid uuid;
begin
  perform set_config('request.jwt.claim.sub',b::text,true);
  s:=public.sb_snapshot(); code:=s#>>'{profile,invite_code}';
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.sb_connect_friend(jsonb_build_object('code',code));
  fid:=(s#>>'{friendships,0,id}')::uuid;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.sb_respond_friend(jsonb_build_object('id',fid,'accept',true));
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.sb_create_bet(jsonb_build_object('title','Transactional live verification','description','A test rolled back after verification','category','Everyday','stake',40,'deadline',now()+interval '1 day','options',jsonb_build_array('Yes','No'),'option','No','friend_ids',jsonb_build_array(b)));
  bid:=(s#>>'{bets,0,id}')::uuid;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.sb_join_bet(jsonb_build_object('id',bid,'option','Yes'));
  perform public.sb_add_comment(jsonb_build_object('id',bid,'body','Temporary verification comment'));
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.sb_lock_bet(jsonb_build_object('id',bid));
  s:=public.sb_propose_result(jsonb_build_object('id',bid,'outcome','Yes','note','Test confirmed outcome'));
  if jsonb_array_length(s->'obligations')<>0 then raise exception 'FAIL: debt appeared before consent'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  s:=public.sb_vote_result(jsonb_build_object('id',bid,'approve',true));
  if (s#>>'{obligations,0,remaining}')::numeric is distinct from 40 then raise exception 'FAIL: wrong credit debt'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.sb_send_settlement(jsonb_build_object('creditor_id',b,'amount',15,'method','Other','note','Temporary verification note'));
  sid:=(s#>>'{settlements,0,id}')::uuid;
  if (s#>>'{obligations,0,remaining}')::numeric is distinct from 40 then raise exception 'FAIL: pending note changed debt'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  s:=public.sb_respond_settlement(jsonb_build_object('id',sid,'accept',false));
  if (s#>>'{obligations,0,remaining}')::numeric is distinct from 40 then raise exception 'FAIL: declined note changed debt'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.sb_send_settlement(jsonb_build_object('creditor_id',b,'amount',40,'method','Other','note','Temporary verification full settlement'));
  select (value->>'id')::uuid into sid from jsonb_array_elements(s->'settlements') where value->>'status'='pending';
  perform set_config('request.jwt.claim.sub',b::text,true);
  s:=public.sb_respond_settlement(jsonb_build_object('id',sid,'accept',true));
  if (s#>>'{obligations,0,remaining}')::numeric is distinct from 0 then raise exception 'FAIL: accepted note did not clear debt'; end if;
  begin
    perform public.sb_respond_settlement(jsonb_build_object('id',sid,'accept',true));
    raise exception 'FAIL: duplicate acceptance succeeded';
  exception when others then
    if sqlerrm not like '%already been answered%' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: live two-user friendship, bet, consent, debt, decline, acceptance and duplicate protection; every test row rolled back.' as verification;
