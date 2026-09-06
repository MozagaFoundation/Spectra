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
