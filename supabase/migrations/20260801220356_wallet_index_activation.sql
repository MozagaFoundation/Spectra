-- Wallet indexing is opt-in, owner-scoped, and delivers only transient events.

delete from public.wallet_transfer_notifications;
delete from public.wallet_index_user_addresses;
delete from public.wallet_index_addresses;
delete from public.wallet_index_cursors;
delete from public.wallet_indexer_runs;
delete from public.wallet_index_chain_blocks;
drop table if exists public.wallet_transfer_notifications;
drop table if exists public.wallet_index_user_addresses;
drop table if exists public.wallet_index_transactions;

drop index if exists public.wallet_index_addresses_scan_idx;
alter table public.wallet_index_addresses
  drop column if exists is_active;

create table public.wallet_index_activation_challenges (
  activation_id text primary key,
  owner_user_id text not null,
  owner_wallet_address text not null,
  chain text not null,
  address text not null,
  address_hash text not null,
  activation_nonce text not null,
  address_proof jsonb,
  vdf_challenge_id text,
  vdf_nonce_hex text,
  vdf_binding_hash text,
  vdf_parameter_id text,
  vdf_created_at timestamptz,
  vdf_expires_at timestamptz,
  vdf_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint wallet_index_activation_challenges_id_check
    check (activation_id ~ '^wia1\.[0-9a-f]{32}$'),
  constraint wallet_index_activation_challenges_user_check
    check (length(owner_user_id) between 8 and 256),
  constraint wallet_index_activation_challenges_wallet_check
    check (owner_wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint wallet_index_activation_challenges_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_activation_challenges_address_check
    check (length(address) between 26 and 96),
  constraint wallet_index_activation_challenges_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_activation_challenges_nonce_check
    check (activation_nonce ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_activation_challenges_proof_check
    check (address_proof is null or jsonb_typeof(address_proof) = 'object'),
  constraint wallet_index_activation_challenges_vdf_check
    check (
      (vdf_challenge_id is null and vdf_nonce_hex is null and vdf_binding_hash is null
        and vdf_parameter_id is null and vdf_created_at is null and vdf_expires_at is null)
      or (
        vdf_challenge_id ~ '^vdfc1\.[0-9a-f]{32}$'
        and vdf_nonce_hex ~ '^[0-9a-f]{64}$'
        and vdf_binding_hash ~ '^[0-9a-f]{64}$'
        and length(vdf_parameter_id) between 8 and 128
        and vdf_created_at is not null
        and vdf_expires_at > vdf_created_at
      )
    ),
  constraint wallet_index_activation_challenges_time_check
    check (expires_at > created_at)
);

create unique index wallet_index_activation_challenges_active_owner_idx
  on public.wallet_index_activation_challenges (owner_user_id, chain, address_hash)
  where vdf_consumed_at is null;
create index wallet_index_activation_challenges_expiry_idx
  on public.wallet_index_activation_challenges (expires_at);

create table public.wallet_index_activation_leases (
  lease_id text primary key,
  owner_user_id text not null,
  owner_wallet_address text not null,
  chain text not null,
  address_hash text not null,
  address text not null,
  lease_generation integer not null default 1,
  baseline_height numeric not null,
  activated_at timestamptz not null default now(),
  last_chain_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  initial_snapshot_pending boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint wallet_index_activation_leases_id_check
    check (lease_id ~ '^wil1\.[0-9a-f]{32}$'),
  constraint wallet_index_activation_leases_user_check
    check (length(owner_user_id) between 8 and 256),
  constraint wallet_index_activation_leases_wallet_check
    check (owner_wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint wallet_index_activation_leases_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_activation_leases_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_activation_leases_generation_check
    check (lease_generation >= 1),
  constraint wallet_index_activation_leases_height_check
    check (baseline_height >= 0),
  constraint wallet_index_activation_leases_time_check
    check (
      last_chain_activity_at >= activated_at
      and expires_at > last_chain_activity_at
    ),
  constraint wallet_index_activation_leases_address_fk
    foreign key (chain, address_hash, address)
    references public.wallet_index_addresses(chain, address_hash, address)
    on delete cascade,
  constraint wallet_index_activation_leases_owner_address_unique
    unique (owner_user_id, chain, address_hash)
);

create index wallet_index_activation_leases_scan_idx
  on public.wallet_index_activation_leases (chain, expires_at, address_hash);
create index wallet_index_activation_leases_owner_idx
  on public.wallet_index_activation_leases (owner_user_id, expires_at);

create table public.wallet_index_delivery_events (
  event_id text primary key,
  lease_id text not null,
  owner_user_id text not null,
  chain text not null,
  address_hash text not null,
  lease_generation integer not null,
  event_kind text not null,
  event_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint wallet_index_delivery_events_id_check
    check (event_id ~ '^wie1\.[0-9a-f]{32}$'),
  constraint wallet_index_delivery_events_user_check
    check (length(owner_user_id) between 8 and 256),
  constraint wallet_index_delivery_events_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_delivery_events_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_delivery_events_generation_check
    check (lease_generation >= 1),
  constraint wallet_index_delivery_events_kind_check
    check (event_kind in ('snapshot', 'transaction', 'balance')),
  constraint wallet_index_delivery_events_key_check
    check (length(event_key) between 1 and 256),
  constraint wallet_index_delivery_events_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint wallet_index_delivery_events_time_check
    check (expires_at > created_at),
  constraint wallet_index_delivery_events_lease_fk
    foreign key (lease_id)
    references public.wallet_index_activation_leases(lease_id)
    on delete cascade,
  constraint wallet_index_delivery_events_lease_key_unique
    unique (lease_id, lease_generation, event_key)
);

create index wallet_index_delivery_events_owner_idx
  on public.wallet_index_delivery_events (owner_user_id, created_at, event_id);
create index wallet_index_delivery_events_expiry_idx
  on public.wallet_index_delivery_events (expires_at);

create table public.wallet_index_wakeup_throttles (
  owner_user_id text primary key,
  last_sent_at timestamptz not null,
  constraint wallet_index_wakeup_throttles_user_check
    check (length(owner_user_id) between 8 and 256)
);

drop trigger if exists wallet_index_activation_leases_set_updated_at
  on public.wallet_index_activation_leases;
create trigger wallet_index_activation_leases_set_updated_at
before update on public.wallet_index_activation_leases
for each row execute function spectra_private.set_updated_at();

alter table public.wallet_index_activation_challenges enable row level security;
alter table public.wallet_index_activation_challenges force row level security;
alter table public.wallet_index_activation_leases enable row level security;
alter table public.wallet_index_activation_leases force row level security;
alter table public.wallet_index_delivery_events enable row level security;
alter table public.wallet_index_delivery_events force row level security;
alter table public.wallet_index_wakeup_throttles enable row level security;
alter table public.wallet_index_wakeup_throttles force row level security;

revoke all on table public.wallet_index_activation_challenges,
  public.wallet_index_activation_leases,
  public.wallet_index_delivery_events,
  public.wallet_index_wakeup_throttles
  from public, anon, authenticated;
grant select, insert, update, delete on table public.wallet_index_activation_challenges,
  public.wallet_index_activation_leases,
  public.wallet_index_delivery_events,
  public.wallet_index_wakeup_throttles
  to service_role;

do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'wallet_index_wakeups'
  ) then
    perform pgmq.create('wallet_index_wakeups');
  end if;
end
$$;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'spectra-wallet-backfill-worker',
      'spectra-wallet-backfill-mozaga',
      'spectra-wallet-backfill-ethereum',
      'spectra-wallet-backfill-bitcoin',
      'spectra-wallet-backfill-solana',
      'spectra-wallet-backfill-tron'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$cron$;

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

create or replace function spectra_private.start_account_deletion(
  p_user_id text,
  p_operation_token_hash text default null,
  p_operation_token_expires_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
declare
  v_generation bigint;
  v_object_count integer;
  v_identity_ids text[];
  v_wallet_addresses text[];
  v_deleted_actor text;
begin
  if length(btrim(p_user_id)) not between 8 and 256 then
    raise exception using errcode = '22023', message = 'invalid account deletion user';
  end if;

  select
    coalesce(
      array_agg(bindings.identity_id) filter (where bindings.identity_id is not null),
      array[]::text[]
    ),
    coalesce(array_agg(bindings.wallet_address), array[]::text[])
  into v_identity_ids, v_wallet_addresses
  from public.auth_wallet_bindings bindings
  where bindings.user_id = p_user_id;

  v_deleted_actor :=
    'deleted:' || encode(extensions.digest(p_user_id, 'sha256'), 'hex');

  insert into public.account_deletion_jobs (
    user_id,
    generation,
    status,
    requested_at,
    next_retry_at,
    operation_token_hash,
    operation_token_expires_at,
    updated_at
  ) values (
    p_user_id,
    1,
    'pending',
    now(),
    now(),
    p_operation_token_hash,
    p_operation_token_expires_at,
    now()
  )
  on conflict (user_id) do update set
    generation = public.account_deletion_jobs.generation + 1,
    status = 'pending',
    requested_at = now(),
    postgres_deleted_at = null,
    objects_deleted_at = null,
    relay_deleted_at = null,
    completed_at = null,
    attempt_count = 0,
    last_error = null,
    next_retry_at = now(),
    operation_token_hash = excluded.operation_token_hash,
    operation_token_expires_at = excluded.operation_token_expires_at,
    updated_at = now()
  returning generation into v_generation;

  select count(*)
  into v_object_count
  from public.object_records
  where owner_user_id = p_user_id
    and lifecycle <> 'deleted';

  update public.object_records
  set lifecycle = 'deletion_pending',
      deleted_at = coalesce(deleted_at, now()),
      cleanup_queued_at = coalesce(cleanup_queued_at, now())
  where owner_user_id = p_user_id
    and lifecycle in ('pending', 'active', 'expired');

  perform spectra_private.purge_relay_user(p_user_id);

  delete from public.mobile_spectre_addresses
  where wallet_address = any(v_wallet_addresses);
  delete from public.mobile_account_blind_token_redemptions
  where wallet_address = any(v_wallet_addresses);
  delete from public.mobile_spectre_root_wallets
  where wallet_address = any(v_wallet_addresses);

  delete from public.group_epoch_transitions transitions
  where transitions.owner_user_id = p_user_id
    or transitions.actor_identity_id = any(v_identity_ids)
    or transitions.rotator_identity_id = any(v_identity_ids)
    or transitions.target_identity_ids ?| v_identity_ids
    or transitions.pre_member_identity_ids ?| v_identity_ids
    or transitions.post_member_identity_ids ?| v_identity_ids
    or coalesce(transitions.package_recipient_ids, '[]'::jsonb) ?| v_identity_ids;

  delete from public.chat_key_bundles where owner_user_id = p_user_id;

  update public.support_access_audit_events
  set actor_user_id = v_deleted_actor
  where actor_user_id = p_user_id;
  delete from public.support_ticket_assignments
  where staff_user_id = p_user_id or assigned_by_user_id = p_user_id;
  delete from public.support_staff_roles where user_id = p_user_id;
  update public.support_tickets
  set status = 'deleted',
      description = '[deleted by owner]',
      user_address = '[deleted]'
  where owner_user_id = p_user_id;

  delete from public.mobile_app_records records
  where records.owner_user_id = p_user_id
    or records.body->>'user_id' = p_user_id
    or records.body->>'owner_user_id' = p_user_id
    or records.body->>'wallet_address' = any(v_wallet_addresses)
    or records.body->>'user_address' = any(v_wallet_addresses)
    or records.body->>'identity_id' = any(v_identity_ids)
    or records.body->>'owner_identity_id' = any(v_identity_ids)
    or records.body->>'user_identity_id' = any(v_identity_ids)
    or records.body->>'sender_identity_id' = any(v_identity_ids)
    or (
      records.record_table <> 'chat_group_messages'
      and records.body->>'recipient_identity_id' = any(v_identity_ids)
    );

  delete from public.wallet_index_activation_challenges where owner_user_id = p_user_id;
  delete from public.wallet_index_activation_leases where owner_user_id = p_user_id;
  delete from public.wallet_index_wakeup_throttles where owner_user_id = p_user_id;
  delete from public.wallet_index_addresses addresses
  where not exists (
    select 1
    from public.wallet_index_activation_leases leases
    where leases.chain = addresses.chain
      and leases.address_hash = addresses.address_hash
      and leases.address = addresses.address
  );
  delete from public.auth_wallet_challenges where user_id = p_user_id;
  delete from public.auth_refresh_tokens where user_id = p_user_id;
  delete from public.auth_wallet_bindings where user_id = p_user_id;

  if v_object_count = 0 then
    delete from public.support_tickets where owner_user_id = p_user_id;
    delete from public.object_records
    where owner_user_id = p_user_id and lifecycle = 'deleted';
  end if;

  update public.account_deletion_jobs
  set postgres_deleted_at = now(),
      relay_deleted_at = now(),
      objects_deleted_at = case when v_object_count = 0 then now() else null end,
      status = case when v_object_count = 0 then 'completed' else 'pending' end,
      completed_at = case when v_object_count = 0 then now() else null end,
      last_error = null,
      next_retry_at = now()
  where user_id = p_user_id and generation = v_generation;

  if v_object_count > 0 then
    perform pgmq.send(
      'account_cleanup',
      jsonb_build_object('user_id', p_user_id, 'generation', v_generation)
    );
  end if;

  return v_generation;
end;
$$;
