-- Restore durable relay wakeups on projects that missed the original rollout.

do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'relay_notifications'
  ) then
    perform pgmq.create('relay_notifications');
  end if;
end
$$;

revoke all privileges on all tables in schema pgmq from anon, authenticated;
revoke all privileges on all sequences in schema pgmq from anon, authenticated;

create or replace function spectra_private.store_sealed_relay_message(
  p_sender_user_id text,
  p_recipient_mailbox_token text,
  p_delivery_token text,
  p_delivery_class text,
  p_sealed_envelope jsonb,
  p_push_notification_enabled boolean default false,
  p_retention interval default interval '7 days'
)
returns table (
  message_id text,
  server_sequence bigint,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
declare
  v_message public.sealed_relay_messages;
  v_request_digest text;
begin
  if p_retention <= interval '0 seconds'
    or p_retention > interval '7 days'
  then
    raise exception using errcode = '22023', message = 'invalid relay request';
  end if;

  if p_delivery_token is not null then
    v_request_digest := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'sender_user_id', p_sender_user_id,
            'recipient_mailbox_token', p_recipient_mailbox_token,
            'delivery_class', p_delivery_class,
            'sealed_envelope', p_sealed_envelope,
            'push_notification_enabled', coalesce(p_push_notification_enabled, false),
            'retention_seconds', extract(epoch from p_retention)
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    select *
    into v_message
    from public.sealed_relay_messages messages
    where messages.delivery_token = p_delivery_token;

    if found then
      if v_message.sender_user_id = p_sender_user_id
        and v_message.request_digest = v_request_digest
      then
        return query
          select
            v_message.message_id,
            v_message.server_sequence,
            'pending'::text,
            v_message.created_at,
            v_message.expires_at,
            true;
        return;
      end if;
      raise exception using errcode = '23505', message = 'delivery token conflict';
    end if;
  end if;

  begin
    insert into public.sealed_relay_messages (
      sender_user_id,
      recipient_mailbox_token,
      delivery_token,
      request_digest,
      delivery_class,
      sealed_envelope,
      push_notification_enabled,
      expires_at
    ) values (
      p_sender_user_id,
      p_recipient_mailbox_token,
      p_delivery_token,
      v_request_digest,
      p_delivery_class,
      p_sealed_envelope,
      coalesce(p_push_notification_enabled, false),
      now() + p_retention
    )
    returning * into v_message;
  exception
    when unique_violation then
      if p_delivery_token is null then
        raise;
      end if;

      select *
      into v_message
      from public.sealed_relay_messages messages
      where messages.delivery_token = p_delivery_token;

      if not found
        or v_message.sender_user_id <> p_sender_user_id
        or v_message.request_digest <> v_request_digest
      then
        raise exception using errcode = '23505', message = 'delivery token conflict';
      end if;

      return query
        select
          v_message.message_id,
          v_message.server_sequence,
          'pending'::text,
          v_message.created_at,
          v_message.expires_at,
          true;
      return;
  end;

  perform pgmq.send(
    'relay_notifications',
    jsonb_build_object(
      'version', 1,
      'message_id', v_message.message_id,
      'recipient_mailbox_token', v_message.recipient_mailbox_token,
      'delivery_class', v_message.delivery_class,
      'server_sequence', v_message.server_sequence,
      'push_notification_enabled', v_message.push_notification_enabled
    )
  );

  return query
    select
      v_message.message_id,
      v_message.server_sequence,
      v_message.status,
      v_message.created_at,
      v_message.expires_at,
      false;
end;
$$;

revoke all on function spectra_private.store_sealed_relay_message(
  text,
  text,
  text,
  text,
  jsonb,
  boolean,
  interval
) from public, anon, authenticated;
grant execute on function spectra_private.store_sealed_relay_message(
  text,
  text,
  text,
  text,
  jsonb,
  boolean,
  interval
) to service_role;

create or replace function spectra_private.read_relay_notification_queue(
  p_visibility_timeout integer default 30,
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
    raise exception using errcode = '22023', message = 'invalid relay notification read';
  end if;

  return query
    select *
    from pgmq.read('relay_notifications', p_visibility_timeout, p_quantity);
end;
$$;

create or replace function spectra_private.delete_relay_notification(
  p_queue_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_message_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid relay notification delete';
  end if;
  return pgmq.delete('relay_notifications', p_queue_message_id);
end;
$$;

revoke all on function spectra_private.read_relay_notification_queue(integer, integer)
  from public, anon, authenticated;
revoke all on function spectra_private.delete_relay_notification(bigint)
  from public, anon, authenticated;
grant execute on function spectra_private.read_relay_notification_queue(integer, integer)
  to service_role;
grant execute on function spectra_private.delete_relay_notification(bigint)
  to service_role;

create or replace function spectra_private.invoke_worker_webhook(p_worker text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, extensions
as $$
declare
  v_base_url text;
  v_secret text;
  v_url text;
  v_body jsonb;
  v_request_id bigint;
begin
  if p_worker not in (
    'janitor',
    'wallet-worker',
    'market-worker',
    'notification-worker'
  ) then
    raise exception using errcode = '22023', message = 'invalid worker';
  end if;

  select decrypted_secret into v_base_url
  from vault.decrypted_secrets
  where name = 'spectra_edge_functions_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'spectra_maintenance_bearer';

  if v_base_url is null or v_secret is null then
    return null;
  end if;
  if
    v_base_url <> 'https://zaobpddfzrwbijfzohxs.supabase.co/functions/v1'
    or length(v_secret) < 32
    or length(v_secret) > 512
  then
    raise exception using errcode = '22023', message = 'invalid worker Vault configuration';
  end if;

  v_url := v_base_url || '/spectra-' || p_worker;
  v_body := case p_worker
    when 'janitor' then jsonb_build_object('accountLimit', 25)
    when 'wallet-worker' then jsonb_build_object(
      'chains', jsonb_build_array(),
      'limit', 50,
      'mode', 'all',
      'runId', 'cron:' || extensions.gen_random_uuid()::text
    )
    when 'notification-worker' then jsonb_build_object('limit', 50)
    else '{}'::jsonb
  end;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Spectra-Internal-Secret', v_secret
    ),
    body := v_body,
    timeout_milliseconds := case
      when p_worker = 'notification-worker' then 120000
      else 5000
    end
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function spectra_private.invoke_worker_webhook(text)
  from public, anon, authenticated;
grant execute on function spectra_private.invoke_worker_webhook(text)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'spectra-notification-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-notification-worker',
    '* * * * *',
    $$select spectra_private.invoke_worker_webhook('notification-worker')$$
  );
end
$cron$;
