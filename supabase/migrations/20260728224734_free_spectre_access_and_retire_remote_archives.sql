-- Tor is available to every wallet. Root registration exists only to enforce
-- the anonymous ephemeral-token cooldown without linking a ticket to its target.

delete from public.mobile_paid_root_addresses roots
where exists (
  select 1
  from public.mobile_spectre_addresses spectre
  where spectre.wallet_address = roots.wallet_address
)
and not exists (
  select 1
  from public.mobile_account_blind_token_issues issues
  where issues.wallet_address = roots.wallet_address
);

delete from public.mobile_paid_root_addresses roots
where not exists (
  select 1
  from public.auth_wallet_bindings bindings
  where bindings.wallet_address = roots.wallet_address
);

alter table public.mobile_paid_root_addresses
  rename to mobile_spectre_root_wallets;

alter table public.mobile_spectre_root_wallets
  drop constraint if exists mobile_paid_root_addresses_wallet_check,
  drop constraint if exists mobile_paid_root_addresses_tier_check,
  drop constraint if exists mobile_paid_root_addresses_billing_check,
  drop constraint if exists mobile_paid_root_addresses_status_check,
  drop constraint if exists mobile_paid_root_addresses_deactivation_check;

alter table public.mobile_spectre_root_wallets
  drop column if exists tier,
  drop column if exists billing_source,
  drop column if exists status,
  drop column if exists notes,
  drop column if exists deactivated_at;

alter table public.mobile_spectre_root_wallets
  rename column activated_at to registered_at;

alter table public.mobile_spectre_root_wallets
  add constraint mobile_spectre_root_wallets_wallet_check
  check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  drop constraint if exists mobile_spectre_root_wallets_binding_fk,
  add constraint mobile_spectre_root_wallets_binding_fk
  foreign key (wallet_address)
  references public.auth_wallet_bindings(wallet_address)
  on delete cascade;

drop index if exists public.mobile_paid_root_addresses_status_idx;
create index if not exists mobile_spectre_root_wallets_registered_idx
  on public.mobile_spectre_root_wallets (registered_at desc);

drop trigger if exists mobile_paid_root_addresses_set_updated_at
  on public.mobile_spectre_root_wallets;
drop trigger if exists mobile_spectre_root_wallets_set_updated_at
  on public.mobile_spectre_root_wallets;
create trigger mobile_spectre_root_wallets_set_updated_at
before update on public.mobile_spectre_root_wallets
for each row execute function spectra_private.set_updated_at();

-- Storage objects must be purged through the Storage API before this migration.
do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'objects'
      and name like 'users/%/spectre-backups/%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'retired Spectre archive objects must be purged through the Storage API first';
  end if;
end;
$$;

delete from public.mobile_spectre_backup_audit_events;
delete from public.mobile_spectre_backup_manifests;
delete from public.object_records where purpose = 'internal_backup';

drop table public.mobile_spectre_backup_audit_events;
drop table public.mobile_spectre_backup_manifests;

alter table public.object_records
  drop constraint if exists object_records_key_check,
  drop constraint if exists object_records_purpose_check,
  drop constraint if exists object_records_purpose_path_check,
  drop constraint if exists object_records_size_check;

alter table public.object_records
  add constraint object_records_key_check
  check (
    object_key ~ '^users/[0-9a-f]{64}/(avatars|attachments|support-attachments)/[0-9a-f]{32}[.]enc$'
    and split_part(object_key, '/', 2) =
      encode(extensions.digest(owner_user_id, 'sha256'), 'hex')
  ),
  add constraint object_records_purpose_check
  check (purpose in ('public_avatar', 'chat_media', 'support_attachment')),
  add constraint object_records_purpose_path_check
  check (
    split_part(object_key, '/', 3) = case purpose
      when 'public_avatar' then 'avatars'
      when 'chat_media' then 'attachments'
      when 'support_attachment' then 'support-attachments'
    end
  ),
  add constraint object_records_size_check
  check (declared_size > 0 and declared_size <= 52428800);

update storage.buckets
set file_size_limit = 52428800
where id = 'objects';

create or replace function spectra_private.issue_ephemeral_spectre_ticket(
  p_wallet_address text,
  p_issued_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_next_available timestamptz;
begin
  perform 1
  from public.mobile_spectre_root_wallets roots
  where roots.wallet_address = p_wallet_address
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'root wallet is not registered';
  end if;

  select issues.next_available_at
  into v_next_available
  from public.mobile_account_blind_token_issues issues
  where issues.wallet_address = p_wallet_address
    and issues.ticket_purpose = 'spectre_ephemeral'
    and issues.period_start = date '1970-01-01'
  for update;

  if found and v_next_available > p_issued_at then
    raise exception using errcode = 'P0001', message = 'ticket cooldown unavailable';
  end if;

  v_next_available := p_issued_at + interval '24 hours';

  insert into public.mobile_account_blind_token_issues (
    wallet_address,
    ticket_purpose,
    period_start,
    issued_count,
    last_issued_at,
    next_available_at,
    updated_at
  ) values (
    p_wallet_address,
    'spectre_ephemeral',
    date '1970-01-01',
    1,
    p_issued_at,
    v_next_available,
    p_issued_at
  )
  on conflict (wallet_address, ticket_purpose, period_start) do update set
    issued_count = 1,
    last_issued_at = excluded.last_issued_at,
    next_available_at = excluded.next_available_at,
    updated_at = excluded.updated_at;

  return v_next_available;
end;
$$;

create or replace function spectra_private.redeem_ephemeral_spectre_ticket(
  p_wallet_address text,
  p_nullifier_hash text,
  p_token_key_id text,
  p_redeemed_at timestamptz default now()
)
returns public.mobile_spectre_addresses
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_address public.mobile_spectre_addresses;
begin
  delete from public.mobile_spectre_addresses
  where wallet_address = p_wallet_address
    and is_ephemeral
    and expires_at <= p_redeemed_at;

  if exists (
    select 1
    from public.mobile_spectre_root_wallets roots
    where roots.wallet_address = p_wallet_address
  ) or exists (
    select 1
    from public.mobile_spectre_addresses spectre
    where spectre.wallet_address = p_wallet_address
  ) then
    raise exception using errcode = '42501', message = 'wallet has conflicting account state';
  end if;

  insert into public.mobile_account_blind_token_redemptions (
    nullifier_hash,
    wallet_address,
    ticket_purpose,
    token_key_id,
    is_ephemeral,
    redeemed_at,
    updated_at
  ) values (
    p_nullifier_hash,
    p_wallet_address,
    'spectre_ephemeral',
    p_token_key_id,
    true,
    p_redeemed_at,
    p_redeemed_at
  );

  insert into public.mobile_spectre_addresses (
    wallet_address,
    is_ephemeral,
    activated_at,
    expires_at,
    updated_at
  ) values (
    p_wallet_address,
    true,
    p_redeemed_at,
    p_redeemed_at + interval '24 hours',
    p_redeemed_at
  )
  returning * into v_address;

  return v_address;
end;
$$;

create or replace function spectra_private.run_retention_maintenance(
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
    from public.wallet_transfer_notifications
    where (read_at is not null and read_at < now() - interval '90 days')
       or created_at < now() - interval '1 year'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_transfer_notifications rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_notifications', v_count);

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
    select object_ref
    from public.object_records
    where lifecycle in ('pending', 'active', 'expired')
      and (
        retention_expires_at <= now()
        or (lifecycle = 'pending' and created_at < now() - interval '1 hour')
      )
    order by coalesce(retention_expires_at, created_at)
    limit p_batch_size
    for update skip locked
  )
  update public.object_records rows
  set lifecycle = 'deletion_pending',
      deleted_at = coalesce(rows.deleted_at, now())
  from victims
  where rows.object_ref = victims.object_ref;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('object_cleanup_queued', v_count);

  with victims as (
    select id
    from public.support_tickets
    where status <> 'deleted'
      and retention_expires_at <= now()
    order by retention_expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.support_tickets rows
  set status = 'deleted',
      description = '[retention expired]',
      user_address = '[deleted]'
  from victims
  where rows.id = victims.id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('support_tickets', v_count);

  with victims as (
    select ctid
    from public.support_access_audit_events
    where created_at < now() - interval '2 years'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.support_access_audit_events rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('support_audit_events', v_count);

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

  return v_result;
end;
$$;

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
  delete from public.wallet_index_user_addresses where user_id = p_user_id;
  delete from public.wallet_index_addresses addresses
  where not exists (
    select 1
    from public.wallet_index_user_addresses users
    where users.address_hash = addresses.address_hash
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
