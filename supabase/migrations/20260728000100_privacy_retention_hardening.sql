-- Bound relay storage and remove metadata once it no longer serves delivery.

update public.sealed_relay_messages
set expires_at = least(expires_at, created_at + interval '7 days')
where expires_at > created_at + interval '7 days';

alter table public.sealed_relay_messages
  alter column expires_at set default (now() + interval '7 days');

alter table public.sealed_relay_messages
  drop constraint if exists sealed_relay_messages_retention_check;

alter table public.sealed_relay_messages
  add constraint sealed_relay_messages_retention_check
  check (
    expires_at > created_at
    and expires_at <= created_at + interval '7 days'
  );

alter table public.chat_key_bundles
  drop column if exists pseudonym;

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

alter table public.mobile_account_blind_token_redemptions
  alter column wallet_address drop not null;

alter table public.mobile_account_blind_token_redemptions
  drop constraint if exists mobile_account_blind_token_redemptions_wallet_check;

alter table public.mobile_account_blind_token_redemptions
  add constraint mobile_account_blind_token_redemptions_wallet_check
  check (wallet_address is null or wallet_address ~ '^EXO00[0-9a-f]{38}$');

create index if not exists chat_one_time_prekeys_consumed_retention_idx
  on public.chat_one_time_prekeys (consumed_at)
  where consumed_at is not null;

create index if not exists mobile_app_records_privacy_retention_idx
  on public.mobile_app_records (record_table, updated_at)
  where record_table in ('call_sessions', 'notification_token_registrations');

create index if not exists mobile_account_blind_token_issues_retention_idx
  on public.mobile_account_blind_token_issues (next_available_at)
  where next_available_at is not null;

create or replace function spectra_private.run_privacy_retention_maintenance(
  p_batch_size integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_result jsonb := '{}'::jsonb;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'invalid retention batch size';
  end if;

  with victims as (
    select ctid
    from public.chat_one_time_prekeys
    where consumed_at < now() - interval '7 days'
    order by consumed_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.chat_one_time_prekeys rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('consumed_chat_prekeys', v_count);

  with victims as (
    select ctid
    from public.mobile_app_records
    where (
      record_table = 'call_sessions'
      and updated_at < now() - interval '7 days'
    ) or (
      record_table = 'notification_token_registrations'
      and updated_at < now() - interval '30 days'
    )
    order by updated_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_app_records rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('stale_app_records', v_count);

  with victims as (
    select ctid
    from public.mobile_account_blind_token_issues
    where next_available_at < now() - interval '7 days'
    order by next_available_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_account_blind_token_issues rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('blind_token_issues', v_count);

  with victims as (
    select redemptions.ctid
    from public.mobile_account_blind_token_redemptions redemptions
    where redemptions.wallet_address is not null
      and redemptions.redeemed_at < now() - interval '7 days'
      and not exists (
        select 1
        from public.mobile_spectre_addresses addresses
        where addresses.wallet_address = redemptions.wallet_address
      )
    order by redemptions.redeemed_at
    limit p_batch_size
    for update skip locked
  )
  update public.mobile_account_blind_token_redemptions rows
  set wallet_address = null,
      updated_at = now()
  from victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('blind_redemption_wallets_scrubbed', v_count);

  with victims as (
    select addresses.chain, addresses.address_hash, addresses.address
    from public.wallet_index_addresses addresses
    where not exists (
      select 1
      from public.wallet_index_user_addresses users
      where users.chain = addresses.chain
        and users.address_hash = addresses.address_hash
        and users.address = addresses.address
    )
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_index_addresses rows
  using victims
  where rows.chain = victims.chain
    and rows.address_hash = victims.address_hash
    and rows.address = victims.address;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('orphaned_wallet_index_addresses', v_count);

  with victims as (
    select ctid
    from public.wallet_indexer_runs
    where started_at < now() - interval '7 days'
    order by started_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_indexer_runs rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_indexer_runs', v_count);

  return v_result;
end;
$$;

revoke all on function spectra_private.run_privacy_retention_maintenance(integer)
  from public, anon, authenticated;
grant execute on function spectra_private.run_privacy_retention_maintenance(integer)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'spectra-privacy-retention'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-privacy-retention',
    '*/5 * * * *',
    'select spectra_private.run_privacy_retention_maintenance(10000)'
  );
end
$cron$;
