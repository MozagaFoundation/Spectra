do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'call_notifications'
  ) then
    perform pgmq.create('call_notifications');
  end if;
end
$$;

revoke all privileges on all tables in schema pgmq from anon, authenticated;
revoke all privileges on all sequences in schema pgmq from anon, authenticated;

create index if not exists mobile_app_call_session_participants_idx
  on public.mobile_app_records (
    (body->>'caller_identity_id'),
    (body->>'callee_identity_id'),
    updated_at desc
  )
  where record_table = 'call_sessions';

create index if not exists mobile_app_call_signal_delivery_idx
  on public.mobile_app_records (
    (body->>'call_session_id'),
    (body->>'recipient_identity_id'),
    ((body->>'sequence_number')::numeric)
  )
  where record_table = 'call_signals'
    and body->>'sequence_number' ~ '^[0-9]+$';

create or replace function spectra_private.enqueue_call_session_notification(
  p_session jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, extensions
as $$
declare
  v_session_id text := p_session->>'id';
  v_caller_identity_id text := p_session->>'caller_identity_id';
  v_callee_identity_id text := p_session->>'callee_identity_id';
  v_call_type text := p_session->>'call_type';
  v_state text := p_session->>'state';
  v_event_type text;
  v_recipients text[];
  v_recipient text;
  v_event_key text;
  v_inserted boolean;
  v_queued boolean := false;
  v_expires_at timestamptz;
begin
  if jsonb_typeof(p_session) <> 'object'
    or v_session_id is null
    or v_caller_identity_id is null
    or v_callee_identity_id is null
    or v_call_type not in ('voice', 'video')
    or v_caller_identity_id = v_callee_identity_id
    or char_length(v_session_id) not between 1 and 256
    or char_length(v_caller_identity_id) not between 1 and 256
    or char_length(v_callee_identity_id) not between 1 and 256
    or v_session_id ~ '[[:space:][:cntrl:]]'
    or v_caller_identity_id ~ '[[:space:][:cntrl:]]'
    or v_callee_identity_id ~ '[[:space:][:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'invalid call notification';
  end if;

  if v_state in ('initiating', 'ringing') then
    v_event_type := 'call';
    v_recipients := array[v_callee_identity_id];
    v_expires_at := now() + interval '2 minutes';
  elsif v_state in ('ended', 'failed') then
    v_event_type := 'call_end';
    v_recipients := array[v_caller_identity_id, v_callee_identity_id];
    v_expires_at := now() + interval '10 minutes';
  else
    return false;
  end if;

  foreach v_recipient in array v_recipients
  loop
    v_event_key := 'call_event:' || encode(
      extensions.digest(
        convert_to(
          'call-notification-v1' || E'\x1f' || v_event_type || E'\x1f' ||
          v_session_id || E'\x1f' || v_recipient,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    v_inserted := false;
    insert into public.push_notification_dispatches (dispatch_key, created_at)
    values (v_event_key, now())
    on conflict (dispatch_key) do nothing
    returning true into v_inserted;

    if coalesce(v_inserted, false) then
      perform pgmq.send(
        'call_notifications',
        jsonb_build_object(
          'version', 1,
          'event_key', v_event_key,
          'type', v_event_type,
          'call_session_id', v_session_id,
          'caller_identity_id', v_caller_identity_id,
          'callee_identity_id', v_callee_identity_id,
          'recipient_identity_id', v_recipient,
          'call_type', v_call_type,
          'expires_at', v_expires_at
        )
      );
      v_queued := true;
    end if;
  end loop;

  return v_queued;
end;
$$;

create or replace function spectra_private.read_call_notification_queue(
  p_visibility_timeout integer default 300,
  p_quantity integer default 25
)
returns setof pgmq.message_record
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_visibility_timeout not between 15 and 3600
    or p_quantity not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'invalid call notification read';
  end if;

  return query
    select *
    from pgmq.read('call_notifications', p_visibility_timeout, p_quantity);
end;
$$;

create or replace function spectra_private.delete_call_notification(
  p_queue_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_message_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid call notification delete';
  end if;
  return pgmq.delete('call_notifications', p_queue_message_id);
end;
$$;

create or replace function spectra_private.release_call_notification_event(
  p_event_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_event_key !~ '^call_event:[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid call notification event';
  end if;

  delete from public.push_notification_dispatches
  where dispatch_key = p_event_key;
  return found;
end;
$$;

create or replace function spectra_private.expire_stale_call_sessions(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, extensions
as $$
declare
  v_session jsonb;
  v_count integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid call expiry limit';
  end if;

  for v_session in
    with victims as (
      select ctid
      from public.mobile_app_records
      where record_table = 'call_sessions'
        and coalesce(body->>'state', '') in (
          'initiating',
          'ringing',
          'connecting',
          'connected',
          'reconnecting'
        )
        and updated_at <= now() - case
          when body->>'state' = 'connected' then interval '5 minutes'
          else interval '90 seconds'
        end
      order by updated_at
      limit p_limit
      for update skip locked
    ),
    updated as (
      update public.mobile_app_records rows
      set body = rows.body || jsonb_build_object(
            'state', 'failed',
            'end_reason', case
              when rows.body->>'state' = 'connected' then 'network_error'
              else 'timeout'
            end,
            'ended_at', now(),
            'updated_at', now()
          ),
          updated_at = now()
      from victims
      where rows.ctid = victims.ctid
      returning rows.body
    )
    select body from updated
  loop
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function spectra_private.run_call_retention(
  p_batch_size integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, extensions
as $$
declare
  v_count integer;
  v_result jsonb := '{}'::jsonb;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'invalid call retention batch size';
  end if;

  v_count := spectra_private.expire_stale_call_sessions(least(p_batch_size, 500));
  v_result := v_result || jsonb_build_object('sessions_expired', v_count);

  with victims as (
    select ctid
    from public.mobile_app_records
    where record_table = 'call_signals'
      and created_at < now() - interval '1 day'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_app_records rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('signals_deleted', v_count);

  with victims as (
    select ctid
    from public.mobile_app_records
    where record_table = 'call_sessions'
      and body->>'state' in ('ended', 'failed')
      and updated_at < now() - interval '7 days'
    order by updated_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_app_records rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('sessions_deleted', v_count);

  return v_result;
end;
$$;

revoke all on function spectra_private.enqueue_call_session_notification(jsonb)
  from public, anon, authenticated;
revoke all on function spectra_private.read_call_notification_queue(integer, integer)
  from public, anon, authenticated;
revoke all on function spectra_private.delete_call_notification(bigint)
  from public, anon, authenticated;
revoke all on function spectra_private.release_call_notification_event(text)
  from public, anon, authenticated;
revoke all on function spectra_private.expire_stale_call_sessions(integer)
  from public, anon, authenticated;
revoke all on function spectra_private.run_call_retention(integer)
  from public, anon, authenticated;

grant execute on function spectra_private.enqueue_call_session_notification(jsonb)
  to service_role;
grant execute on function spectra_private.read_call_notification_queue(integer, integer)
  to service_role;
grant execute on function spectra_private.delete_call_notification(bigint)
  to service_role;
grant execute on function spectra_private.release_call_notification_event(text)
  to service_role;
grant execute on function spectra_private.expire_stale_call_sessions(integer)
  to service_role;
grant execute on function spectra_private.run_call_retention(integer)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'spectra-call-retention'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-call-retention',
    '*/5 * * * *',
    'select spectra_private.run_call_retention(10000)'
  );
end
$cron$;
