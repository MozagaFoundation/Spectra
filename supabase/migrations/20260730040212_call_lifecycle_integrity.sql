drop index if exists public.mobile_app_call_signal_delivery_idx;

create index mobile_app_call_signal_delivery_idx
  on public.mobile_app_records (
    (body->>'call_session_id'),
    (body->>'recipient_identity_id'),
    ((body->>'sequence_number')::numeric)
  )
  where record_table = 'call_signals'
    and body->>'sequence_number' ~ '^[0-9]+$';

create or replace function spectra_private.enforce_call_lifecycle_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous_state text;
  v_next_state text;
  v_session jsonb;
  v_session_id text;
  v_sender_identity_id text;
  v_recipient_identity_id text;
begin
  if new.record_table = 'call_sessions' then
    v_next_state := new.body->>'state';

    if tg_op = 'INSERT' then
      if v_next_state <> 'initiating' then
        raise exception using errcode = '22023', message = 'invalid call state transition';
      end if;
      return new;
    end if;

    v_previous_state := old.body->>'state';
    if v_previous_state in ('ended', 'failed') and v_next_state is distinct from v_previous_state then
      raise exception using errcode = '22023', message = 'invalid call state transition';
    end if;

    if v_next_state is distinct from v_previous_state
      and v_next_state not in ('ended', 'failed')
      and not (
        (v_previous_state = 'initiating' and v_next_state in ('ringing', 'connecting'))
        or (v_previous_state = 'ringing' and v_next_state = 'connecting')
        or (v_previous_state = 'connecting' and v_next_state in ('connected', 'reconnecting'))
        or (v_previous_state = 'connected' and v_next_state = 'reconnecting')
        or (v_previous_state = 'reconnecting' and v_next_state = 'connected')
      )
    then
      raise exception using errcode = '22023', message = 'invalid call state transition';
    end if;

    return new;
  end if;

  if new.record_table <> 'call_signals' or tg_op <> 'INSERT' then
    return new;
  end if;

  v_session_id := new.body->>'call_session_id';
  v_sender_identity_id := new.body->>'sender_identity_id';
  v_recipient_identity_id := new.body->>'recipient_identity_id';

  select records.body into v_session
  from public.mobile_app_records records
  where records.record_table = 'call_sessions'
    and records.record_id = v_session_id
    and (
      (records.body->>'caller_identity_id' = v_sender_identity_id
        and records.body->>'callee_identity_id' = v_recipient_identity_id)
      or (records.body->>'caller_identity_id' = v_recipient_identity_id
        and records.body->>'callee_identity_id' = v_sender_identity_id)
    )
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'invalid call signal session';
  end if;

  if v_session->>'state' in ('ended', 'failed') then
    raise exception using errcode = 'P0001', message = 'call_terminated';
  end if;

  return new;
end;
$$;

drop trigger if exists spectra_call_lifecycle_integrity
  on public.mobile_app_records;

create trigger spectra_call_lifecycle_integrity
before insert or update of body on public.mobile_app_records
for each row
execute function spectra_private.enforce_call_lifecycle_integrity();

revoke all on function spectra_private.enforce_call_lifecycle_integrity()
  from public, anon, authenticated;
