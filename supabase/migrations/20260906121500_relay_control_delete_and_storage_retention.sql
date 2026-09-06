-- Pending control may be deleted after an authenticated open. Pending messages stay.
-- Restore privacy retention so expiry and indexer storage windows keep running.

create or replace function spectra_private.delete_sealed_relay_messages(
  p_user_id text,
  p_message_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requested integer;
  v_remaining integer;
begin
  if p_message_ids is null or cardinality(p_message_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid relay delete set';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(p_message_ids) id
  where length(btrim(id)) between 1 and 200;

  if v_requested = 0 then
    return 0;
  end if;

  if exists (
    select 1
    from public.sealed_relay_messages messages
    where messages.message_id in (
      select distinct btrim(id) from unnest(p_message_ids) id
    )
      and not exists (
        select 1
        from public.chat_mailbox_token_owners owners
        where owners.mailbox_token = messages.recipient_mailbox_token
          and owners.user_id = p_user_id
      )
  ) then
    raise exception using errcode = '42501', message = 'relay message unavailable';
  end if;

  delete from public.sealed_relay_messages messages
  where messages.message_id in (
    select distinct btrim(id) from unnest(p_message_ids) id
  )
    and (
      messages.status in ('delivered', 'read')
      or (
        messages.delivery_class = 'control'
        and messages.status = 'pending'
      )
    )
    and exists (
      select 1
      from public.chat_mailbox_token_owners owners
      where owners.mailbox_token = messages.recipient_mailbox_token
        and owners.user_id = p_user_id
    );

  select count(*)
  into v_remaining
  from public.sealed_relay_messages messages
  where messages.message_id in (
    select distinct btrim(id) from unnest(p_message_ids) id
  );

  return v_requested - v_remaining;
end;
$$;

create index if not exists wallet_indexer_runs_started_idx
  on public.wallet_indexer_runs (started_at);

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
    from public.sealed_relay_messages
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.sealed_relay_messages rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('sealed_relay_messages', v_count);

  with victims as (
    select ctid
    from public.auth_wallet_challenges
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.auth_wallet_challenges rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('auth_wallet_challenges', v_count);

  with victims as (
    select ctid
    from public.auth_refresh_tokens
    where expires_at < now() - interval '24 hours'
       or revoked_at < now() - interval '24 hours'
       or rotated_at < now() - interval '24 hours'
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.auth_refresh_tokens rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('auth_refresh_tokens', v_count);

  with victims as (
    select ctid
    from public.api_rate_limits
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.api_rate_limits rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('api_rate_limits', v_count);

  with victims as (
    select ctid
    from public.push_notification_dispatches
    where created_at < now() - interval '7 days'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.push_notification_dispatches rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('push_dispatches', v_count);

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
    select ctid
    from public.mobile_spectre_addresses
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_spectre_addresses rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('spectre_addresses', v_count);

  with victims as (
    select ctid
    from public.wallet_index_activation_challenges
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_index_activation_challenges rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('expired_wallet_index_challenges', v_count);

  with victims as (
    select ctid
    from public.wallet_index_delivery_events
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_index_delivery_events rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('expired_wallet_index_events', v_count);

  with victims as (
    select lease_id
    from public.wallet_index_activation_leases
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_index_activation_leases rows
  using victims
  where rows.lease_id = victims.lease_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('expired_wallet_index_leases', v_count);

  with victims as (
    select throttles.owner_user_id
    from public.wallet_index_wakeup_throttles throttles
    where not exists (
      select 1
      from public.wallet_index_activation_leases leases
      where leases.owner_user_id = throttles.owner_user_id
        and leases.expires_at > now()
    )
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_index_wakeup_throttles rows
  using victims
  where rows.owner_user_id = victims.owner_user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('stale_wallet_index_wakeup_throttles', v_count);

  with victims as (
    select addresses.chain, addresses.address_hash, addresses.address
    from public.wallet_index_addresses addresses
    where not exists (
      select 1
      from public.wallet_index_activation_leases leases
      where leases.chain = addresses.chain
        and leases.address_hash = addresses.address_hash
        and leases.address = addresses.address
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
    select chain, cursor_name
    from public.wallet_index_cursors
    where lock_expires_at <= now()
    order by lock_expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.wallet_index_cursors rows
  set run_id = null,
      locked_at = null,
      lock_expires_at = null,
      updated_at = now()
  from victims
  where rows.chain = victims.chain
    and rows.cursor_name = victims.cursor_name;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_cursor_locks', v_count);

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

  with bounds as (
    select
      chain,
      greatest(
        0::numeric,
        coalesce(
          least(
            coalesce(min(last_scanned_height), min(last_finalized_height)),
            coalesce(min(last_finalized_height), min(last_scanned_height))
          ),
          0
        ) - 4096
      ) as prune_below
    from public.wallet_index_cursors
    where cursor_name = 'transactions'
      and (last_scanned_height is not null or last_finalized_height is not null)
    group by chain
  ),
  victims as (
    select blocks.ctid
    from public.wallet_index_chain_blocks blocks
    join bounds on bounds.chain = blocks.chain
    where blocks.block_height < bounds.prune_below
    order by blocks.chain, blocks.block_height
    limit p_batch_size
    for update of blocks skip locked
  )
  delete from public.wallet_index_chain_blocks rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_index_chain_blocks', v_count);

  with victims as (
    select transition_id
    from public.group_epoch_transitions
    where status = 'pending' and expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.group_epoch_transitions rows
  set status = 'cancelled'
  from victims
  where rows.transition_id = victims.transition_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('group_transitions_cancelled', v_count);

  with victims as (
    select transition_id
    from public.group_epoch_transitions
    where status in ('activated', 'cancelled')
      and created_at < now() - interval '90 days'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.group_epoch_transitions rows
  using victims
  where rows.transition_id = victims.transition_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('group_transitions', v_count);

  with victims as (
    select user_id
    from public.account_deletion_jobs
    where status = 'completed'
      and completed_at < now() - interval '90 days'
      and (
        operation_token_expires_at is null
        or operation_token_expires_at <= now()
      )
    order by completed_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.account_deletion_jobs rows
  using victims
  where rows.user_id = victims.user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('account_deletion_jobs', v_count);

  begin
    with victims as (
      select ctid
      from cron.job_run_details
      where end_time < now() - interval '7 days'
      order by end_time
      limit p_batch_size
    )
    delete from cron.job_run_details rows
    using victims
    where rows.ctid = victims.ctid;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('cron_job_run_details', v_count);
  exception
    when undefined_table then
      v_result := v_result || jsonb_build_object('cron_job_run_details', 0);
    when insufficient_privilege then
      v_result := v_result || jsonb_build_object('cron_job_run_details', 0);
  end;

  begin
    with victims as (
      select ctid
      from net._http_response
      where created < now() - interval '24 hours'
      order by created
      limit p_batch_size
    )
    delete from net._http_response rows
    using victims
    where rows.ctid = victims.ctid;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('pg_net_responses', v_count);
  exception
    when undefined_table then
      v_result := v_result || jsonb_build_object('pg_net_responses', 0);
    when insufficient_privilege then
      v_result := v_result || jsonb_build_object('pg_net_responses', 0);
  end;

  return v_result;
end;
$$;

revoke all on function spectra_private.delete_sealed_relay_messages(text, text[])
  from public, anon, authenticated;
grant execute on function spectra_private.delete_sealed_relay_messages(text, text[])
  to service_role;

revoke all on function spectra_private.run_privacy_retention_maintenance(integer)
  from public, anon, authenticated;
grant execute on function spectra_private.run_privacy_retention_maintenance(integer)
  to service_role;
